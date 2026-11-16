import type { Prisma } from "#shared/generated/client";
import type {
  CollectionMatchReason,
  CollectionSearchResult,
  CollectionSearchSort,
} from "#shared/types/collection";
import { personNameWords } from "#shared/utils/adminSearch";
import { parseDiscoverSearch } from "#shared/utils/discoverSearch";
import { escapeLike } from "#shared/utils/searchQuery";
import {
  collectionPosterStats,
  collectionSummarySelect,
  publicCollectionWhere,
  toCollectionSummaries,
} from "./collections";
import { buildDiscoverPosterWhere } from "./discoverPosterWhere";

// Collection search for /discover and /discover/collections. A public
// collection with at least one public poster matches when either holds:
//
// 1. Details: the free text is in its name, description, conference or owner's
//    name, or a `collection:` term is in its name.
// 2. Posters: it holds a poster that matches the full Discover poster search,
//    sidebar filters included.

/** The sidebar filters Discover sends, which only narrow posters. */
const POSTER_FILTER_PARAMS = [
  "source",
  "language",
  "license",
  "publicationYear",
  "institution",
  "funder",
] as const;

export type CollectionSearchOptions = {
  /** Match on collection details. */
  details: boolean;
  /** Match on the posters inside. */
  posters: boolean;
  sort: CollectionSearchSort | null;
  page: number;
  limit: number;
};

type Match = { reason: CollectionMatchReason; matchingPosterCount: number };

const REASON_RANK: Record<CollectionMatchReason, number> = {
  name: 0,
  details: 1,
  posters: 2,
};

function hasValue(value: unknown) {
  return Array.isArray(value)
    ? value.some((v) => String(v).trim() !== "")
    : value !== undefined && value !== null && String(value).trim() !== "";
}

/** Whether a search or a poster filter is active. */
export function isCollectionSearchActive(query: Record<string, unknown>) {
  const parsed = parseDiscoverSearch(
    typeof query.search === "string" ? query.search : "",
  );

  return (
    parsed.freeText !== "" ||
    parsed.clauses.length > 0 ||
    POSTER_FILTER_PARAMS.some((param) => hasValue(query[param]))
  );
}

async function detailsMatches(
  freeText: string,
  nameTerms: string[],
): Promise<Map<string, CollectionMatchReason>> {
  const matches = new Map<string, CollectionMatchReason>();

  if (!freeText && nameTerms.length === 0) return matches;

  const contains = (value: string) => ({
    contains: escapeLike(value),
    mode: "insensitive" as const,
  });

  const nameClauses: Prisma.CollectionWhereInput[] = nameTerms.map((term) => ({
    name: contains(term),
  }));

  const ownerWords = personNameWords(freeText);
  const freeTextClause: Prisma.CollectionWhereInput | null = freeText
    ? {
        OR: [
          { name: contains(freeText) },
          { description: contains(freeText) },
          { conference: contains(freeText) },
          // "Jane Doe" finds the owner word by word, as admin search does.
          {
            owner: {
              AND: (ownerWords.length > 0 ? ownerWords : [freeText]).map(
                (word) => ({
                  OR: [
                    { givenName: contains(word) },
                    { familyName: contains(word) },
                  ],
                }),
              ),
            },
          },
        ],
      }
    : null;

  const rows = await prisma.collection.findMany({
    where: {
      ...publicCollectionWhere,
      AND: [...nameClauses, ...(freeTextClause ? [freeTextClause] : [])],
    },
    select: { id: true, name: true },
  });

  const lowerFreeText = freeText.toLowerCase();

  for (const row of rows) {
    const inName =
      nameTerms.length > 0 ||
      (lowerFreeText !== "" && row.name.toLowerCase().includes(lowerFreeText));

    matches.set(row.id, inName ? "name" : "details");
  }

  return matches;
}

/** How many matching posters each public collection holds. */
async function posterMatches(
  query: Record<string, unknown>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const posterWhere = await buildDiscoverPosterWhere(query);

  if (!posterWhere) return counts;

  // Collections hold the version root. The root row matches when it is the
  // latest version; otherwise its latest version does.
  const groups = await prisma.collectionPoster.groupBy({
    by: ["collectionId"],
    where: {
      collection: publicCollectionWhere,
      OR: [
        { poster: posterWhere },
        { poster: { versions: { some: posterWhere } } },
      ],
    },
    _count: { _all: true },
  });

  for (const group of groups) counts.set(group.collectionId, group._count._all);

  return counts;
}

/**
 * Public collections for a Discover query, ranked and paged. With no search
 * and no filters it lists every public collection.
 */
export async function searchCollections(
  query: Record<string, unknown>,
  options: CollectionSearchOptions,
): Promise<{ collections: CollectionSearchResult[]; total: number }> {
  const active = isCollectionSearchActive(query);
  const parsed = parseDiscoverSearch(
    typeof query.search === "string" ? query.search : "",
  );

  const matches = new Map<string, Match>();
  let candidateIds: string[];

  if (active) {
    const nameTerms = parsed.clauses
      .filter((clause) => clause.field === "collection")
      .map((clause) => clause.term);
    const otherClauses = parsed.clauses.some(
      (clause) => clause.field !== "collection",
    );

    const [byDetails, byPosters] = await Promise.all([
      options.details
        ? detailsMatches(parsed.freeText, nameTerms)
        : new Map<string, CollectionMatchReason>(),
      // A search that is only `collection:` terms is about collections, not
      // posters, so posters inside don't widen it.
      options.posters &&
      (parsed.freeText !== "" ||
        otherClauses ||
        POSTER_FILTER_PARAMS.some((param) => hasValue(query[param])))
        ? posterMatches(query)
        : new Map<string, number>(),
    ]);

    for (const [id, count] of byPosters) {
      matches.set(id, { reason: "posters", matchingPosterCount: count });
    }

    for (const [id, reason] of byDetails) {
      matches.set(id, {
        reason,
        matchingPosterCount: byPosters.get(id) ?? 0,
      });
    }

    candidateIds = [...matches.keys()];
  } else {
    const rows = await prisma.collection.findMany({
      where: publicCollectionWhere,
      select: { id: true },
    });

    candidateIds = rows.map((row) => row.id);
  }

  if (candidateIds.length === 0) return { collections: [], total: 0 };

  const [stats, rows] = await Promise.all([
    collectionPosterStats(candidateIds),
    prisma.collection.findMany({
      where: { id: { in: candidateIds } },
      select: collectionSummarySelect,
    }),
  ]);

  // Visitors never land on an empty collection.
  const live = rows.filter((row) => (stats.get(row.id)?.posterCount ?? 0) > 0);

  const sort: CollectionSearchSort =
    options.sort ?? (active ? "relevance" : "newest");

  const posterCount = (id: string) => stats.get(id)?.posterCount ?? 0;
  const newest = (a: (typeof live)[number], b: (typeof live)[number]) =>
    b.created.getTime() - a.created.getTime();

  live.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name) || newest(a, b);
      case "posters":
        return posterCount(b.id) - posterCount(a.id) || newest(a, b);
      case "relevance": {
        const ma = matches.get(a.id);
        const mb = matches.get(b.id);

        if (!ma || !mb) return newest(a, b);

        return (
          REASON_RANK[ma.reason] - REASON_RANK[mb.reason] ||
          mb.matchingPosterCount - ma.matchingPosterCount ||
          newest(a, b)
        );
      }
      default:
        return newest(a, b);
    }
  });

  const start = (options.page - 1) * options.limit;
  const pageRows = live.slice(start, start + options.limit);
  const summaries = await toCollectionSummaries(pageRows, { stats });

  return {
    total: live.length,
    collections: summaries.map((summary) => {
      const match = matches.get(summary.id);

      return {
        ...summary,
        reason: match?.reason ?? null,
        matchingPosterCount: match?.matchingPosterCount ?? 0,
      };
    }),
  };
}
