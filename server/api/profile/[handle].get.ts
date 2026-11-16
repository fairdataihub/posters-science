import { parseProfileParam, profilePath } from "#shared/utils/profile";
import {
  latestPublicPosterVersions,
  matchProfilePosterSearch,
  profilePosterSelect,
  publicPosterListing,
  toProfilePosterCard,
  type ProfilePosterCard,
} from "../../utils/profilePosters";

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
      orcid: true,
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
      where: { ...publicPosterListing, userId: user.id },
      orderBy: { versionSequence: "desc" },
      select: profilePosterSelect,
    }),
    latestPublicPosterVersions(claims.map((claim) => claim.posterId)),
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
        toProfilePosterCard(
          version,
          "publisher",
          version.publishedAt ?? version.created,
        ),
      );
    }
  }

  for (const [rootId, version] of claimedByRoot) {
    if (!cards.has(rootId)) {
      cards.set(
        rootId,
        toProfilePosterCard(version, "author", claimedAt.get(rootId) ?? null),
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
    // An iD linked through ORCID sign-in wins over one typed in Settings.
    orcid: user.linkedAccounts[0]?.providerAccountId ?? (user.orcid || null),
    memberSince: user.created,
    isOwner,
    isPublic: user.profilePublic,
    posters,
    // Null when the user hasn't chosen to show their likes.
    likedPosters: liked,
    searchMatches: await matchProfilePosterSearch(getQuery(event).search, [
      ...posters,
      ...(liked ?? []),
    ]),
  };
});

/** Posters the user liked, most recently liked first. */
async function loadLikedPosters(userId: string) {
  // Likes are stored against the version root.
  const likes = await prisma.like.findMany({
    where: { userId },
    orderBy: { created: "desc" },
    select: { posterId: true, created: true },
  });

  const latestByRoot = await latestPublicPosterVersions(
    likes.map((like) => like.posterId),
  );

  return likes.flatMap((like) => {
    const version = latestByRoot.get(like.posterId);

    return version ? [toProfilePosterCard(version, null, like.created)] : [];
  });
}
