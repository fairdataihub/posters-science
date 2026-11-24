import type { Prisma } from "#shared/generated/client";
import type {
  DashboardSearchMatches,
  PosterRepository,
} from "#shared/types/dashboardFeed";
import { parseDiscoverSearch } from "#shared/utils/discoverSearch";
import { isLicenseNoise, normalizeLicense } from "./canonicalize";
import { buildDiscoverSearchFilter } from "./discoverSearch";

// The dashboard's Published list, shared by its feed (GET /api/poster) and
// its search (GET /api/user/dashboard-search) so both agree on which posters
// it holds: the latest published version of each of the user's own posters and
// of each poster they claimed, retired ones included.

/** The latest published version of the poster families a user claimed. */
export function claimedPosterVersionsWhere(
  userId: string,
  rootIds: number[],
): Prisma.PosterWhereInput {
  return {
    status: "published",
    isLatestVersion: true,
    // Never list a poster the user already owns twice.
    NOT: { userId },
    OR: [{ id: { in: rootIds } }, { versionRootId: { in: rootIds } }],
  };
}

type FamilyVersion = {
  id: number;
  versionRootId: number | null;
  versionSequence: number;
};

function latestOfEachFamily(versions: FamilyVersion[]): number[] {
  const latest = new Map<number, FamilyVersion>();

  for (const version of versions) {
    const rootId = posterFamilyRootId(version);
    const current = latest.get(rootId);

    if (!current || version.versionSequence > current.versionSequence) {
      latest.set(rootId, version);
    }
  }

  return [...latest.values()].map((version) => version.id);
}

/** Version ids of the posters in the user's Published list. */
export async function dashboardPublishedVersionIds(
  userId: string,
): Promise<number[]> {
  const familyVersion = {
    id: true,
    versionRootId: true,
    versionSequence: true,
  } as const;

  const [owned, claims] = await Promise.all([
    prisma.poster.findMany({
      where: { userId, status: "published" },
      select: familyVersion,
    }),
    prisma.posterClaim.findMany({
      where: { userId },
      select: { posterId: true },
    }),
  ]);

  const claimed =
    claims.length > 0
      ? await prisma.poster.findMany({
          where: claimedPosterVersionsWhere(
            userId,
            claims.map((claim) => claim.posterId),
          ),
          select: familyVersion,
        })
      : [];

  return [...latestOfEachFamily(owned), ...latestOfEachFamily(claimed)];
}

/**
 * The user's Published posters that match a Discover-style search, with the
 * same matching as /discover, and the bulk uploads the search names. Both
 * lists are null when there is no search.
 */
export async function matchDashboardPublishedSearch(
  userId: string,
  search: string,
): Promise<DashboardSearchMatches> {
  const parsed = parseDiscoverSearch(search);

  if (!parsed.freeText && parsed.clauses.length === 0) {
    return { rootIds: null, bulkSubmissionIds: null };
  }

  const versionIds = await dashboardPublishedVersionIds(userId);
  let rootIds: number[] = [];

  if (versionIds.length > 0) {
    const filter = await buildDiscoverSearchFilter(parsed, {
      scope: versionIds,
    });

    if (filter.ids?.length !== 0) {
      const matching = await prisma.poster.findMany({
        where: {
          AND: [
            { id: { in: versionIds } },
            ...(filter.ids ? [{ id: { in: filter.ids } }] : []),
            ...filter.where,
          ],
        },
        select: { id: true, versionRootId: true },
      });

      rootIds = [...new Set(matching.map(posterFamilyRootId))];
    }
  }

  // Bulk uploads whose name holds the free text. The dashboard lists all of
  // their posters, and finds the ones that match on their own through rootIds.
  const freeText = parsed.freeText.toLowerCase();
  const bulkSubmissions = freeText
    ? await prisma.bulkSubmission.findMany({
        where: { userId },
        select: { id: true, name: true },
      })
    : [];

  const bulkSubmissionIds = bulkSubmissions
    .filter((bulk) => bulk.name.toLowerCase().includes(freeText))
    .map((bulk) => bulk.id);

  return { rootIds, bulkSubmissionIds };
}

/**
 * Where a published poster is archived, for the dashboard's Repository
 * filter. A poster published to Figshare from Posters.science has its own
 * record; other Figshare posters are told apart the way the Discover source
 * filter does it, and Discover counts every other auto-indexed poster as
 * Zenodo's.
 */
export function posterRepository(poster: {
  automated: boolean;
  imageUrl: string;
  posterMetadata: { doi: string | null } | null;
  /** The poster's Zenodo deposition, despite the plural name. */
  zenodoDepositions: {
    status: string;
    lastPublishedZenodoDoi: string | null;
  } | null;
  figshareDeposition?: { status: string } | null;
}): PosterRepository {
  const doi = (poster.posterMetadata?.doi ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "");

  if (
    poster.figshareDeposition?.status === "published" ||
    poster.imageUrl.toLowerCase().includes("/figshare_") ||
    doi.startsWith("10.6084/")
  ) {
    return "figshare";
  }

  if (
    poster.automated ||
    doi.startsWith("10.5281/") ||
    poster.zenodoDepositions?.status === "published" ||
    !!poster.zenodoDepositions?.lastPublishedZenodoDoi
  ) {
    return "zenodo";
  }

  return "other";
}

/** The same license buckets as profile cards and the Discover filter. */
export function posterLicenseBucket(
  license: string | null | undefined,
): string | null {
  const raw = license?.trim() ?? "";

  return raw && !isLicenseNoise(raw) ? normalizeLicense(raw) : null;
}
