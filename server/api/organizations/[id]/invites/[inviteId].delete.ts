import { logwatch } from "../../../../utils/logwatch";
import { requireOrgOwner } from "../../../../utils/organizations";

/** An owner withdraws a pending invite. */
export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const inviteId = getRouterParam(event, "inviteId") ?? "";
  const { session } = await requireOrgOwner(event, organizationId);

  const { count } = await prisma.organizationInvite.deleteMany({
    where: { id: inviteId, organizationId },
  });

  if (count === 0) {
    throw createError({ statusCode: 404, statusMessage: "Invite not found" });
  }

  logwatch.info({
    action: "organization.invite.revoke",
    message: "Invite revoked",
    userId: session.user.id,
    organizationId,
    inviteId,
  });

  return { success: true };
});
