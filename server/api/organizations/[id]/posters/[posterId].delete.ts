import { logwatch } from "../../../../utils/logwatch";
import { requireOrgMember } from "../../../../utils/organizations";

/**
 * Takes a poster off the organization's page. An owner can remove any poster,
 * and a member can remove the ones they added. The poster itself is unchanged.
 */
export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const { session, role } = await requireOrgMember(event, organizationId);
  const userId = session.user.id;
  const posterId = await resolvePosterRootId(getRouterParam(event, "posterId"));

  const listing = await prisma.organizationPoster.findUnique({
    where: { organizationId_posterId: { organizationId, posterId } },
    select: { id: true, addedById: true },
  });

  if (!listing) {
    throw createError({
      statusCode: 404,
      statusMessage: "This poster isn't on the organization's page",
    });
  }

  if (role !== "owner" && listing.addedById !== userId) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Only an owner or the member who added this poster can remove it",
    });
  }

  await prisma.organizationPoster.delete({ where: { id: listing.id } });

  logwatch.info({
    action: "organization.poster.remove",
    message: "Poster removed from an organization",
    userId,
    organizationId,
    posterId,
    addedById: listing.addedById,
  });

  return { success: true };
});
