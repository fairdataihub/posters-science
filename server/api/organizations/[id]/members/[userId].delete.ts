import { logwatch } from "../../../../utils/logwatch";
import {
  ORGANIZATION_LAST_OWNER_MESSAGE,
  requireOrgMember,
  withOrganizationOwnersLocked,
} from "../../../../utils/organizations";

/**
 * A member leaves, or an owner removes someone. The posters they showed stay
 * on the page: they can still take them off from their dashboard, and an owner
 * can remove them.
 */
export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const targetUserId = getRouterParam(event, "userId") ?? "";
  const { session, role } = await requireOrgMember(event, organizationId);
  const leaving = targetUserId === session.user.id;

  if (!leaving && role !== "owner") {
    throw createError({
      statusCode: 403,
      statusMessage: "Only an owner of this organization can do this",
    });
  }

  await withOrganizationOwnersLocked(organizationId, async (tx, ownerCount) => {
    const member = await tx.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: targetUserId },
      },
      select: { id: true, role: true },
    });

    if (!member) {
      throw createError({
        statusCode: 404,
        statusMessage: "This person isn't a member of the organization",
      });
    }

    if (member.role === "owner" && ownerCount <= 1) {
      throw createError({
        statusCode: 409,
        statusMessage: ORGANIZATION_LAST_OWNER_MESSAGE,
      });
    }

    await tx.organizationMember.delete({ where: { id: member.id } });
  });

  logwatch.info({
    action: leaving
      ? "organization.member.leave"
      : "organization.member.remove",
    message: leaving
      ? "Member left the organization"
      : "Member removed from the organization",
    userId: session.user.id,
    organizationId,
    targetUserId,
  });

  return { success: true };
});
