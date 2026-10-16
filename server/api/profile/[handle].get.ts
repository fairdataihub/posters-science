import type { Prisma } from "#shared/generated/client";
import iso6391 from "#shared/data/iso-639-1.json";
import { parseDiscoverSearch } from "#shared/utils/discoverSearch";
import { parseProfileParam, profilePath } from "#shared/utils/profile";
import { isLicenseNoise, normalizeLicense } from "../../utils/canonicalize";
import { buildDiscoverSearchFilter } from "../../utils/discoverSearch";

const languageNames = new Map(iso6391.map((l) => [l.code, l.name]));

// The same posters Discover lists: published, not retired, latest version.
const publicListing = {
  status: "published",
  tombstone: false,
  isLatestVersion: true,
} as const;

const posterSelect = {
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

/**
 * Public profile for /profile/<profileId>. To anyone but its owner, a private
 * profile and an unknown id both return 404, so a private user's name never
 * shows up behind a URL that resolves. The owner can still open their own
 * private profile to preview it.
 *
 * `search` takes the Discover search syntax. Every poster is still returned so
 * the page can show totals; `searchMatches` lists the ones that match.
 */
export default defineEventHandler(async (event) => {
  const { handle } = event.context.params as { handle: string };
  const profileId = parseProfileParam(handle ?? "");

  if (!profileId) {
    throw createError({ statusCode: 404, statusMessage: "Profile not found" });
  }

  const user = await prisma.user.findFirst({
    where: { profileId },
    select: {
      id: true,
      profileId: true,
      profilePublic: true,
      givenName: true,
      familyName: true,
      affiliation: true,
      bio: true,
      profileShowLikes: true,
      created: true,
      linkedAccounts: {
        where: { provider: "orcid" },
        select: { providerAccountId: true },
      },
    },
  });

  const session = await getUserSession(event);
  const isOwner = Boolean(user) && session?.user?.id === user?.id;

  if (!user?.profileId || (!user.profilePublic && !isOwner)) {
    throw createError({ statusCode: 404, statusMessage: "Profile not found" });
  }

  const claims = await prisma.posterClaim.findMany({
    where: { userId: user.id, poster: { tombstone: false } },
    select: { posterId: true, created: true },
  });
  const claimedAt = new Map(
    claims.map((claim) => [claim.posterId, claim.created]),
  );

  const [ownedVersions, claimedByRoot, liked] = await Promise.all([
    prisma.poster.findMany({
      where: { ...publicListing, userId: user.id },
      orderBy: { versionSequence: "desc" },
      select: posterSelect,
    }),
    latestPublicVersions(claims.map((claim) => claim.posterId)),
    // Liked posters are only ever loaded when the user opted in.
    user.profileShowLikes ? loadLikedPosters(user.id) : null,
  ]);

  const cards = new Map<number, ProfilePosterCard>();

  // Publisher wins if a user somehow both owns and claimed the same poster.
  for (const version of ownedVersions) {
    const rootId = posterFamilyRootId(version);

    if (!cards.has(rootId)) {
      cards.set(
        rootId,
        toCard(version, "publisher", version.publishedAt ?? version.created),
      );
    }
  }

  for (const [rootId, version] of claimedByRoot) {
    if (!cards.has(rootId)) {
      cards.set(
        rootId,
        toCard(version, "author", claimedAt.get(rootId) ?? null),
      );
    }
  }

  const posters = [...cards.values()].sort(
    (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
  );

  return {
    path: profilePath(user.profileId),
    givenName: user.givenName,
    familyName: user.familyName,
    affiliation: user.affiliation,
    bio: user.bio,
    // Same avatar the owner sees on their /profile settings page.
    avatarUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=${user.id}`,
    orcid: user.linkedAccounts[0]?.providerAccountId ?? null,
    memberSince: user.created,
    isOwner,
    isPublic: user.profilePublic,
    posters,
    // Null when the user hasn't chosen to show their likes.
    likedPosters: liked,
    searchMatches: await matchSearch(getQuery(event).search, [
      ...posters,
      ...(liked ?? []),
    ]),
  };
});

/**
 * Root ids of the given posters that match a Discover-style search, or null
 * when there is no search. Uses the same matching as /discover.
 */
async function matchSearch(
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

type ProfileVersion = Prisma.PosterGetPayload<{
  select: typeof posterSelect;
}>;

type ProfilePosterCard = ReturnType<typeof toCard>;

function toCard(
  version: ProfileVersion,
  role: "publisher" | "author" | null,
  /** When the poster joined this list: published, claimed or liked. */
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
async function latestPublicVersions(rootIds: number[]) {
  const latestByRoot = new Map<number, ProfileVersion>();

  if (rootIds.length === 0) return latestByRoot;

  const versions = await prisma.poster.findMany({
    where: {
      ...publicListing,
      OR: [{ id: { in: rootIds } }, { versionRootId: { in: rootIds } }],
    },
    orderBy: { versionSequence: "desc" },
    select: posterSelect,
  });

  for (const version of versions) {
    const rootId = posterFamilyRootId(version);

    // Ordered by sequence, so the first one seen is the newest.
    if (!latestByRoot.has(rootId)) latestByRoot.set(rootId, version);
  }

  return latestByRoot;
}

/** Posters the user liked, most recently liked first. */
async function loadLikedPosters(userId: string) {
  // Likes are stored against the version root.
  const likes = await prisma.like.findMany({
    where: { userId },
    orderBy: { created: "desc" },
    select: { posterId: true, created: true },
  });

  const latestByRoot = await latestPublicVersions(
    likes.map((like) => like.posterId),
  );

  return likes.flatMap((like) => {
    const version = latestByRoot.get(like.posterId);

    return version ? [toCard(version, null, like.created)] : [];
  });
}
