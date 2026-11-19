import type {
  MatchingOrcid,
  OrcidSuggestion,
} from "#shared/types/orcidSuggestions";
import { normalizeOrcid } from "#shared/utils/discoverSearch";
import { isValidOrcidChecksum } from "#shared/utils/orcid";
import { AUTO_INDEX_USER_ID } from "./claims";
import { buildDiscoverSearchFilter } from "./discoverSearch";
import { latestPublicPosterVersions } from "./profilePosters";

// Suggested posters: auto-indexed posters whose author list in the repository
// record includes the user's ORCID iD. They are only suggestions. Claiming one
// goes through the same rules as any other claim.

/** At most this many suggestions are listed, and claimed in one request. */
export const ORCID_SUGGESTIONS_LIMIT = 100;

/**
 * The iD posters are matched against: the one linked through ORCID sign-in,
 * which ORCID confirmed, else the one typed on the settings page. The same
 * rule as the public profile.
 */
export async function matchingOrcidFor(userId: string): Promise<MatchingOrcid> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      orcid: true,
      linkedAccounts: {
        where: { provider: "orcid" },
        select: { providerAccountId: true },
      },
    },
  });

  const linked = user?.linkedAccounts[0]?.providerAccountId;

  if (linked) return { orcid: normalizeOrcid(linked), source: "linked" };

  const typed = normalizeOrcid(user?.orcid ?? "");

  if (typed && isValidOrcidChecksum(typed)) {
    return { orcid: typed, source: "typed" };
  }

  return { orcid: null, source: null };
}

/**
 * Version roots of the claimable posters whose latest public version lists
 * the iD for an author, leaving out ones the user already claimed or marked
 * "Not me". Newest first.
 */
export async function orcidSuggestionRootIds(
  userId: string,
  orcid: string,
): Promise<number[]> {
  // The same matching as an orcid: search on Discover.
  const { ids } = await buildDiscoverSearchFilter({
    freeText: "",
    clauses: [{ field: "orcid", term: orcid }],
  });

  if (!ids || ids.length === 0) return [];

  const versions = await prisma.poster.findMany({
    where: { id: { in: ids } },
    select: { id: true, versionRootId: true },
  });
  const rootIds = [...new Set(versions.map(posterFamilyRootId))];

  // The isClaimablePoster rule, applied to every root at once.
  const roots = await prisma.poster.findMany({
    where: {
      id: { in: rootIds },
      automated: true,
      userId: AUTO_INDEX_USER_ID,
      tombstone: false,
      claims: { none: { userId } },
      claimSuggestionDismissals: { none: { userId } },
    },
    orderBy: { id: "desc" },
    select: { id: true },
  });

  return roots.map((root) => root.id);
}

/** The name next to the iD in a record's creators, if any. */
function creatorNameWithOrcid(creators: unknown, orcid: string): string | null {
  if (!Array.isArray(creators)) return null;

  for (const creator of creators) {
    if (!creator || typeof creator !== "object") continue;

    const { name, givenName, familyName, nameIdentifiers } = creator as Record<
      string,
      unknown
    >;
    const identifiers = Array.isArray(nameIdentifiers) ? nameIdentifiers : [];

    // Stored identifiers are either objects or bare strings, and the value
    // may be a bare iD or an orcid.org link.
    const listed = identifiers.some((identifier) => {
      const value =
        identifier && typeof identifier === "object"
          ? (identifier as Record<string, unknown>).nameIdentifier
          : identifier;

      return typeof value === "string" && normalizeOrcid(value) === orcid;
    });

    if (!listed) continue;

    if (typeof name === "string" && name.trim()) return name.trim();

    const parts = [givenName, familyName].filter(
      (part): part is string => typeof part === "string" && !!part.trim(),
    );

    return parts.length > 0 ? parts.join(" ") : null;
  }

  return null;
}

/** Cards for the first ORCID_SUGGESTIONS_LIMIT roots, newest year first. */
export async function orcidSuggestionCards(
  rootIds: number[],
  orcid: string,
): Promise<OrcidSuggestion[]> {
  const latest = await latestPublicPosterVersions(
    rootIds.slice(0, ORCID_SUGGESTIONS_LIMIT),
  );

  const metadata = await prisma.posterMetadata.findMany({
    where: { posterId: { in: [...latest.values()].map((v) => v.id) } },
    select: { posterId: true, creators: true },
  });
  const creatorsByVersion = new Map(
    metadata.map((row) => [row.posterId, row.creators]),
  );

  const cards = [...latest.entries()].map(
    ([rootId, version]): OrcidSuggestion => {
      const meta = version.posterMetadata;
      const conferenceLabel =
        meta?.conferenceAcronym?.trim() || meta?.conferenceName?.trim() || "";

      return {
        posterId: rootId,
        versionId: version.id,
        title: version.title,
        description: version.description,
        imageUrl: version.imageUrl,
        publicationYear: meta?.publicationYear ?? null,
        conference: conferenceLabel
          ? [conferenceLabel, meta?.conferenceYear].filter(Boolean).join(" ")
          : null,
        doi: meta?.doi || null,
        listedAs: creatorNameWithOrcid(
          creatorsByVersion.get(version.id),
          orcid,
        ),
      };
    },
  );

  return cards.sort(
    (a, b) =>
      (b.publicationYear ?? 0) - (a.publicationYear ?? 0) ||
      b.posterId - a.posterId,
  );
}
