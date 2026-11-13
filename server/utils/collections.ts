import type { H3Event } from "h3";
import type { Prisma } from "#shared/generated/client";
import type {
  CollectionCover,
  CollectionOrganizationChoice,
  CollectionSummary,
  MyCollection,
  PosterCollectionChoices,
} from "#shared/types/collection";
import type { OrganizationRole } from "#shared/types/organization";
import {
  COLLECTION_PER_USER_MAX,
  COLLECTION_POSTER_MAX,
  collectionPath,
} from "#shared/utils/collection";
import {
  organizationAvatarUrl,
  organizationPath,
} from "#shared/utils/organization";
import { generateProfileId, profilePath } from "#shared/utils/profile";
import { posterListingRole } from "./organizationPosters";
import { publicPosterListing } from "./profilePosters";

// Rules for collections. A collection never changes who owns a poster: it
// holds only posters its owner published or claimed, the same rule as
// organization listings (listablePosterRoots), and only the publisher edits
// a poster.

const ADDRESS_ATTEMPTS = 5;
const COVERS = 4;

/** Collections anyone can see: public, and not hidden by an admin. */
export const publicCollectionWhere = {
  isPublic: true,
  hiddenAt: null,
} as const satisfies Prisma.CollectionWhereInput;

/** Whether a unique constraint error names this field. */
export function isUniqueClashOn(error: unknown, field: string): boolean {
  const meta = (error as { meta?: unknown } | null)?.meta;

  return JSON.stringify(meta ?? {}).includes(field);
}

/**
 * Runs a create with a new collection address. Ids are random, so a clash is
 * astronomically unlikely, but the unique index is the real guard and a clash
 * just draws a new id. A clash on the source batch is passed on, since a new
 * address would not help.
 */
export async function withNewCollectionProfileId<T>(
  create: (profileId: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < ADDRESS_ATTEMPTS; attempt++) {
    try {
      return await create(generateProfileId());
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      if (isUniqueClashOn(error, "sourceBulkSubmissionId")) throw error;
    }
  }

  throw createError({
    statusCode: 500,
    statusMessage: "Could not create a collection address. Please try again.",
  });
}

/**
 * A collection the signed-in person owns. Anyone else gets the same 404 as an
 * unknown id, so a private collection's existence is never revealed.
 */
export async function requireCollectionOwner(
  event: H3Event,
  collectionId: string,
) {
  const session = await requireDbUserSession(event);

  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, ownerId: session.user.id },
    select: { id: true, name: true, hiddenAt: true },
  });

  if (!collection) {
    throw createError({
      statusCode: 404,
      statusMessage: "Collection not found",
    });
  }

  return { session, collection };
}

/** Throws a 409 when adding this many posters would go over the limit. */
export async function assertCollectionRoom(
  collectionId: string,
  adding: number,
) {
  const current = await prisma.collectionPoster.count({
    where: { collectionId },
  });

  if (current + adding > COLLECTION_POSTER_MAX) {
    throw createError({
      statusCode: 409,
      statusMessage: `A collection can hold up to ${COLLECTION_POSTER_MAX} posters. Remove some first, or start another collection.`,
      data: { reason: "full" },
    });
  }
}

/** Throws a 409 when the person already has as many collections as allowed. */
export async function assertCollectionAllowance(userId: string) {
  const owned = await prisma.collection.count({ where: { ownerId: userId } });

  if (owned >= COLLECTION_PER_USER_MAX) {
    throw createError({
      statusCode: 409,
      statusMessage: `You can have up to ${COLLECTION_PER_USER_MAX} collections. Delete one you no longer need first.`,
      data: { reason: "limit" },
    });
  }
}

/**
 * The image of each poster family that is public right now, by root id.
 * Retired posters and unpublished drafts are left out.
 */
export async function livePosterImages(rootIds: number[]) {
  const images = new Map<number, string>();

  if (rootIds.length === 0) return images;

  const versions = await prisma.poster.findMany({
    where: {
      ...publicPosterListing,
      OR: [{ id: { in: rootIds } }, { versionRootId: { in: rootIds } }],
    },
    orderBy: { versionSequence: "desc" },
    select: { id: true, versionRootId: true, imageUrl: true },
  });

  for (const version of versions) {
    const rootId = posterFamilyRootId(version);

    // Ordered by sequence, so the first one seen is the newest.
    if (!images.has(rootId)) images.set(rootId, version.imageUrl);
  }

  return images;
}

function coverImage(posterId: number, imageUrl: string) {
  return imageUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${posterId}`;
}

/**
 * How many public posters each collection holds, and up to four covers from
 * the newest additions. Two queries however many collections there are.
 */
export async function collectionPosterStats(collectionIds: string[]) {
  const stats = new Map<
    string,
    { posterCount: number; covers: CollectionCover[] }
  >();

  for (const id of collectionIds) stats.set(id, { posterCount: 0, covers: [] });

  if (collectionIds.length === 0) return stats;

  const items = await prisma.collectionPoster.findMany({
    where: { collectionId: { in: collectionIds } },
    orderBy: { created: "desc" },
    select: { collectionId: true, posterId: true },
  });

  const live = await livePosterImages([
    ...new Set(items.map((item) => item.posterId)),
  ]);

  for (const item of items) {
    const imageUrl = live.get(item.posterId);
    const entry = stats.get(item.collectionId);

    if (imageUrl === undefined || !entry) continue;

    entry.posterCount++;

    if (entry.covers.length < COVERS) {
      entry.covers.push({
        posterId: item.posterId,
        imageUrl: coverImage(item.posterId, imageUrl),
      });
    }
  }

  return stats;
}

export const myCollectionSelect = {
  id: true,
  profileId: true,
  name: true,
  description: true,
  conference: true,
  isPublic: true,
  hiddenAt: true,
  hiddenReason: true,
  sourceBulkSubmissionId: true,
  created: true,
  updated: true,
} as const satisfies Prisma.CollectionSelect;

type MyCollectionRow = Prisma.CollectionGetPayload<{
  select: typeof myCollectionSelect;
}>;

/** Collections as their owner sees them, with live counts and covers. */
export async function toMyCollections(
  rows: MyCollectionRow[],
): Promise<MyCollection[]> {
  const stats = await collectionPosterStats(rows.map((row) => row.id));

  return rows.map((row) => {
    const { posterCount, covers } = stats.get(row.id)!;

    return {
      id: row.id,
      path: collectionPath(row.profileId),
      name: row.name,
      description: row.description,
      conference: row.conference,
      isPublic: row.isPublic,
      hidden: row.hiddenAt !== null,
      hiddenReason: row.hiddenReason,
      posterCount,
      covers,
      sourceBulkSubmissionId: row.sourceBulkSubmissionId,
      created: row.created.toISOString(),
      updated: row.updated.toISOString(),
    };
  });
}

export async function toMyCollection(row: MyCollectionRow) {
  const [collection] = await toMyCollections([row]);

  return collection!;
}

export const collectionSummarySelect = {
  id: true,
  profileId: true,
  name: true,
  description: true,
  conference: true,
  created: true,
  updated: true,
  owner: {
    select: {
      givenName: true,
      familyName: true,
      profilePublic: true,
      profileId: true,
    },
  },
} as const satisfies Prisma.CollectionSelect;

type CollectionSummaryRow = Prisma.CollectionGetPayload<{
  select: typeof collectionSummarySelect;
}>;

/** The owner's name, and a link only when their own profile is public. */
export function collectionOwner(owner: CollectionSummaryRow["owner"]) {
  return {
    name: `${owner.givenName} ${owner.familyName}`.trim() || "A member",
    profilePath:
      owner.profilePublic && owner.profileId
        ? profilePath(owner.profileId)
        : null,
  };
}

/**
 * Public collection cards. Collections with no public posters right now are
 * left out unless keepEmpty is set, so visitors never land on an empty page.
 */
export async function toCollectionSummaries(
  rows: CollectionSummaryRow[],
  {
    keepEmpty = false,
    stats: known,
  }: {
    keepEmpty?: boolean;
    /** From collectionPosterStats, when the caller already has them. */
    stats?: Awaited<ReturnType<typeof collectionPosterStats>>;
  } = {},
): Promise<CollectionSummary[]> {
  const stats =
    known ?? (await collectionPosterStats(rows.map((row) => row.id)));

  return rows.flatMap((row) => {
    const { posterCount, covers } = stats.get(row.id)!;

    if (posterCount === 0 && !keepEmpty) return [];

    return [
      {
        id: row.id,
        path: collectionPath(row.profileId),
        name: row.name,
        description: row.description,
        conference: row.conference,
        posterCount,
        covers,
        owner: collectionOwner(row.owner),
        created: row.created.toISOString(),
        updated: row.updated.toISOString(),
      },
    ];
  });
}

/** The person's collections and which of them hold this poster. */
export async function posterCollectionChoices(
  userId: string,
  rootId: number,
): Promise<PosterCollectionChoices> {
  const [collections, role] = await Promise.all([
    prisma.collection.findMany({
      where: { ownerId: userId },
      orderBy: { updated: "desc" },
      select: {
        id: true,
        profileId: true,
        name: true,
        isPublic: true,
        hiddenAt: true,
        posters: { where: { posterId: rootId }, select: { id: true } },
        _count: { select: { posters: true } },
      },
    }),
    posterListingRole(userId, rootId),
  ]);

  return {
    posterId: rootId,
    canAdd: role !== null,
    canCreate: collections.length < COLLECTION_PER_USER_MAX,
    collections: collections.map((collection) => {
      const hidden = collection.hiddenAt !== null;

      return {
        id: collection.id,
        name: collection.name,
        path: collectionPath(collection.profileId),
        isPublic: collection.isPublic && !hidden,
        hidden,
        listed: collection.posters.length > 0,
        full: collection._count.posters >= COLLECTION_POSTER_MAX,
      };
    }),
  };
}

const choiceOrganizationSelect = {
  id: true,
  profileId: true,
  name: true,
  profilePublic: true,
  hiddenAt: true,
} as const;

/**
 * The person's organizations and which of them show this collection, plus
 * organizations they left that still show it, so it can be taken off.
 */
export async function collectionOrganizationChoices(
  userId: string,
  collectionId: string,
): Promise<CollectionOrganizationChoice[]> {
  const [memberships, listings] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { userId },
      orderBy: { created: "asc" },
      select: {
        role: true,
        organization: { select: choiceOrganizationSelect },
      },
    }),
    prisma.organizationCollection.findMany({
      where: { collectionId },
      orderBy: { created: "asc" },
      select: { organization: { select: choiceOrganizationSelect } },
    }),
  ]);

  const listedIds = new Set(listings.map((listing) => listing.organization.id));
  const memberOf = new Set(
    memberships.map((membership) => membership.organization.id),
  );

  const describe = (
    organization: {
      id: string;
      profileId: string;
      name: string;
      profilePublic: boolean;
      hiddenAt: Date | null;
    },
    role: OrganizationRole | null,
  ) => {
    const hidden = organization.hiddenAt !== null;

    return {
      id: organization.id,
      name: organization.name,
      path: organizationPath(organization.profileId),
      avatarUrl: organizationAvatarUrl(organization.profileId),
      role,
      isPublic: organization.profilePublic && !hidden,
      hidden,
      listed: listedIds.has(organization.id),
    };
  };

  return [
    ...memberships.map(({ role, organization }) =>
      describe(organization, role as OrganizationRole),
    ),
    ...listings
      .filter(({ organization }) => !memberOf.has(organization.id))
      .map(({ organization }) => describe(organization, null)),
  ];
}
