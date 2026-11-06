import { logwatch } from "../../../../utils/logwatch";
import { requireVerifiedInviteeEmail } from "../../../../utils/organizationInvites";

/** Turns an invite down. The organization isn't told beyond the invite going away. */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const inviteId = getRouterParam(event, "inviteId") ?? "";
  const emailAddress = await requireVerifiedInviteeEmail(session.user.id);

  const { count } = await prisma.organizationInvite.deleteMany({
    where: { id: inviteId, emailAddress },
  });

  if (count === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "This invite has expired or was withdrawn",
    });
  }

  logwatch.info({
    action: "organization.invite.decline",
    message: "Invite declined",
    userId: session.user.id,
    inviteId,
  });

  return { success: true };
});
