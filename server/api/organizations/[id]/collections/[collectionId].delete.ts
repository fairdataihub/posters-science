import { logwatch } from "../../../../utils/logwatch";
import { requireOrgMember } from "../../../../utils/organizations";

/**
 * Takes a collection off the organization's page. An owner of the
 * organization can remove any collection, and a member can remove their own.
 * The collection itself is unchanged.
 */
export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const collectionId = getRouterParam(event, "collectionId") ?? "";
  const { session, role } = await requireOrgMember(event, organizationId);
  const userId = session.user.id;

  const listing = await prisma.organizationCollection.findUnique({
    where: { organizationId_collectionId: { organizationId, collectionId } },
    select: { id: true, collection: { select: { ownerId: true } } },
  });

  if (!listing) {
    throw createError({
      statusCode: 404,
      statusMessage: "This collection isn't on the organization's page",
    });
  }

  const isMine = listing.collection.ownerId === userId;

  if (role !== "owner" && !isMine) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Only an owner or the member who made this collection can remove it",
    });
  }

  await prisma.organizationCollection.delete({ where: { id: listing.id } });

  logwatch.info({
    action: "collection.org.remove",
    message: "Collection removed from an organization",
    userId,
    organizationId,
    collectionId,
    removedBy: isMine ? "collection_owner" : "organization_owner",
  });

  return { success: true };
});
