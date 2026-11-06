import type { Prisma } from "#shared/generated/client";
import iso6391 from "#shared/data/iso-639-1.json";
import { parseDiscoverSearch } from "#shared/utils/discoverSearch";
import { isLicenseNoise, normalizeLicense } from "./canonicalize";
import { buildDiscoverSearchFilter } from "./discoverSearch";

// The poster lists on public user profiles and organization pages.

const languageNames = new Map(iso6391.map((l) => [l.code, l.name]));

// The same posters Discover lists: published, not retired, latest version.
export const publicPosterListing = {
  status: "published",
  tombstone: false,
  isLatestVersion: true,
} as const;

export const profilePosterSelect = {
  id: true,
  versionRootId: true,
  versionSequence: true,
  title: true,
  description: true,
  imageUrl: true,
  automated: true,
  created: true,
  updated: true,
  publishedAt: true,
  posterMetadata: {
    select: {
      doi: true,
      subjects: true,
      language: true,
      license: true,
      publicationYear: true,
      conferenceName: true,
      conferenceAcronym: true,
      conferenceYear: true,
    },
  },
  // Likes live on the version root, as on Discover.
  _count: { select: { likes: true } },
  versionRoot: { select: { _count: { select: { likes: true } } } },
} as const;

type ProfilePosterVersion = Prisma.PosterGetPayload<{
  select: typeof profilePosterSelect;
}>;

export type ProfilePosterCard = ReturnType<typeof toProfilePosterCard>;

export function toProfilePosterCard(
  version: ProfilePosterVersion,
  role: "publisher" | "author" | null,
  /** When the poster joined this list: published, claimed, liked or listed. */
  addedAt: Date | null,
) {
  const language = version.posterMetadata?.language?.trim() || null;
  const rawLicense = version.posterMetadata?.license?.trim() || "";

  return {
    posterId: posterFamilyRootId(version),
    versionId: version.id,
    role,
    addedAt,
    title: version.title,
    description: version.description,
    imageUrl: version.imageUrl,
    automated: version.automated,
    created: version.created,
    updated: version.updated,
    publishedAt: version.publishedAt,
    keywords: version.posterMetadata?.subjects ?? [],
    language,
    languageLabel: language
      ? (languageNames.get(language.toLowerCase()) ?? language)
      : null,
    // The same license buckets the Discover license filter uses.
    license:
      rawLicense && !isLicenseNoise(rawLicense)
        ? normalizeLicense(rawLicense)
        : null,
    likes: version.versionRoot?._count.likes ?? version._count.likes,
    doi: version.posterMetadata?.doi || null,
    publicationYear: version.posterMetadata?.publicationYear ?? null,
    conferenceName: version.posterMetadata?.conferenceName ?? null,
    conferenceAcronym: version.posterMetadata?.conferenceAcronym ?? null,
    conferenceYear: version.posterMetadata?.conferenceYear ?? null,
  };
}

/** The latest public version of each poster family, keyed by root id. */
export async function latestPublicPosterVersions(rootIds: number[]) {
  const latestByRoot = new Map<number, ProfilePosterVersion>();

  if (rootIds.length === 0) return latestByRoot;

  const versions = await prisma.poster.findMany({
    where: {
      ...publicPosterListing,
      OR: [{ id: { in: rootIds } }, { versionRootId: { in: rootIds } }],
    },
    orderBy: { versionSequence: "desc" },
    select: profilePosterSelect,
  });

  for (const version of versions) {
    const rootId = posterFamilyRootId(version);

    // Ordered by sequence, so the first one seen is the newest.
    if (!latestByRoot.has(rootId)) latestByRoot.set(rootId, version);
  }

  return latestByRoot;
}

/**
 * Root ids of the given posters that match a Discover-style search, or null
 * when there is no search. Uses the same matching as /discover.
 */
export async function matchProfilePosterSearch(
  search: unknown,
  cards: ProfilePosterCard[],
): Promise<number[] | null> {
  const parsed = parseDiscoverSearch(typeof search === "string" ? search : "");

  if (!parsed.freeText && parsed.clauses.length === 0) return null;
  if (cards.length === 0) return [];

  const filter = await buildDiscoverSearchFilter(parsed);

  if (filter.ids?.length === 0) return [];

  const matching = await prisma.poster.findMany({
    where: {
      AND: [
        { id: { in: cards.map((card) => card.versionId) } },
        ...(filter.ids ? [{ id: { in: filter.ids } }] : []),
        ...filter.where,
      ],
    },
    select: { id: true, versionRootId: true },
  });

  return matching.map((poster) => posterFamilyRootId(poster));
}
