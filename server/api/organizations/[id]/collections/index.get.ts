import type { OrganizationCollections } from "#shared/types/collection";
import { collectionPath } from "#shared/utils/collection";
import { collectionPosterStats } from "../../../../utils/collections";
import { requireOrgMember } from "../../../../utils/organizations";

/**
 * The collections on an organization's page, and the member's own collections
 * that could be added. Members see every listing, public or not, so they know
 * what will show once its owner makes it public.
 */
export default defineEventHandler(
  async (event): Promise<OrganizationCollections> => {
    const organizationId = getRouterParam(event, "id") ?? "";
    const { session, role } = await requireOrgMember(event, organizationId);
    const userId = session.user.id;

    const [listings, mine] = await Promise.all([
      prisma.organizationCollection.findMany({
        where: { organizationId },
        orderBy: { created: "desc" },
        select: {
          created: true,
          collection: {
            select: {
              id: true,
              profileId: true,
              name: true,
              isPublic: true,
              hiddenAt: true,
              ownerId: true,
              owner: { select: { givenName: true, familyName: true } },
            },
          },
        },
      }),
      prisma.collection.findMany({
        where: {
          ownerId: userId,
          organizationListings: { none: { organizationId } },
        },
        orderBy: { updated: "desc" },
        select: { id: true, name: true, isPublic: true, hiddenAt: true },
      }),
    ]);

    const stats = await collectionPosterStats([
      ...listings.map((listing) => listing.collection.id),
      ...mine.map((collection) => collection.id),
    ]);

    return {
      listed: listings.map(({ created, collection }) => {
        const isMine = collection.ownerId === userId;

        return {
          collectionId: collection.id,
          name: collection.name,
          path: collectionPath(collection.profileId),
          ownerName: organizationPersonName(collection.owner),
          isMine,
          isPublic: collection.isPublic && collection.hiddenAt === null,
          posterCount: stats.get(collection.id)?.posterCount ?? 0,
          addedAt: created.toISOString(),
          canRemove: role === "owner" || isMine,
        };
      }),
      available: mine.map((collection) => ({
        collectionId: collection.id,
        name: collection.name,
        isPublic: collection.isPublic && collection.hiddenAt === null,
        posterCount: stats.get(collection.id)?.posterCount ?? 0,
      })),
    };
  },
);
