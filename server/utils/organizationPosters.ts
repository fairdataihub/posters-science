import type {
  OrganizationListingRole,
  OrganizationRole,
  PosterOrganizationChoices,
} from "#shared/types/organization";
import {
  organizationAvatarUrl,
  organizationPath,
} from "#shared/utils/organization";
import { publicPosterListing } from "./profilePosters";

// Rules for showing posters on organization pages. A listing never changes
// who owns a poster: only its publisher edits and publishes it.

/**
 * The posters a person may show on an organization page, by version root:
 * published ones they own and ones they claimed, while the poster is public.
 */
export async function listablePosterRoots(
  userId: string,
): Promise<Map<number, OrganizationListingRole>> {
  const [owned, claims] = await Promise.all([
    prisma.poster.findMany({
      where: { ...publicPosterListing, userId },
      select: { id: true, versionRootId: true },
    }),
    prisma.posterClaim.findMany({
      where: { userId },
      select: { posterId: true },
    }),
  ]);

  const roots = new Map<number, OrganizationListingRole>();

  for (const poster of owned)
    roots.set(posterFamilyRootId(poster), "publisher");

  const claimedRootIds = claims.map((claim) => claim.posterId);

  if (claimedRootIds.length > 0) {
    // A claim outlives retirement, so check the poster is still public.
    const claimedPublic = await prisma.poster.findMany({
      where: {
        ...publicPosterListing,
        OR: [
          { id: { in: claimedRootIds } },
          { versionRootId: { in: claimedRootIds } },
        ],
      },
      select: { id: true, versionRootId: true },
    });

    for (const poster of claimedPublic) {
      const rootId = posterFamilyRootId(poster);

      if (!roots.has(rootId)) roots.set(rootId, "author");
    }
  }

  return roots;
}

/** How the person holds one poster, or null if they can't list it. */
export async function posterListingRole(
  userId: string,
  rootId: number,
): Promise<OrganizationListingRole | null> {
  const latest = await prisma.poster.findFirst({
    where: { ...publicPosterListing, ...posterFamilyWhere(rootId) },
    select: { userId: true },
  });

  if (!latest) return null;
  if (latest.userId === userId) return "publisher";

  const claim = await prisma.posterClaim.findUnique({
    where: { posterId_userId: { posterId: rootId, userId } },
    select: { id: true },
  });

  return claim ? "author" : null;
}

/** The version root for any poster id in a family. 400 or 404 otherwise. */
export async function resolvePosterRootId(raw: string | undefined) {
  const posterId = Number.parseInt(raw ?? "", 10);

  if (!Number.isSafeInteger(posterId) || posterId < 1) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  const poster = await prisma.poster.findUnique({
    where: { id: posterId },
    select: { id: true, versionRootId: true },
  });

  if (!poster) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  return posterFamilyRootId(poster);
}

const choiceOrganizationSelect = {
  id: true,
  profileId: true,
  name: true,
  profilePublic: true,
  hiddenAt: true,
} as const;

/**
 * The person's organizations and which of them show this poster. Organizations
 * they have left are included while they still show a listing the person
 * added, so it can be taken off.
 */
export async function posterOrganizationChoices(
  userId: string,
  rootId: number,
): Promise<PosterOrganizationChoices> {
  const [memberships, formerListings, role] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { userId },
      orderBy: { created: "asc" },
      select: {
        role: true,
        organization: {
          select: {
            ...choiceOrganizationSelect,
            posters: {
              where: { posterId: rootId },
              select: { addedById: true },
            },
          },
        },
      },
    }),
    prisma.organizationPoster.findMany({
      where: {
        posterId: rootId,
        addedById: userId,
        organization: { members: { none: { userId } } },
      },
      orderBy: { created: "asc" },
      select: { organization: { select: choiceOrganizationSelect } },
    }),
    posterListingRole(userId, rootId),
  ]);

  const describe = (organization: {
    id: string;
    profileId: string;
    name: string;
    profilePublic: boolean;
    hiddenAt: Date | null;
  }) => {
    const hidden = organization.hiddenAt !== null;

    return {
      id: organization.id,
      name: organization.name,
      path: organizationPath(organization.profileId),
      avatarUrl: organizationAvatarUrl(organization.profileId),
      isPublic: organization.profilePublic && !hidden,
      hidden,
    };
  };

  return {
    posterId: rootId,
    canList: role !== null,
    organizations: [
      ...memberships.map(({ role: memberRole, organization }) => {
        const listing = organization.posters[0];

        return {
          ...describe(organization),
          role: memberRole as OrganizationRole,
          listed: Boolean(listing),
          addedByMe: listing?.addedById === userId,
        };
      }),
      ...formerListings.map(({ organization }) => ({
        ...describe(organization),
        role: null,
        listed: true,
        addedByMe: true,
      })),
    ],
  };
}
