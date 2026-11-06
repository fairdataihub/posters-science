import { logwatch } from "../../../../utils/logwatch";
import { requireVerifiedInviteeEmail } from "../../../../utils/organizationInvites";

/** Joins the organization as a member. The invite must be for this person. */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const userId = session.user.id;
  const inviteId = getRouterParam(event, "inviteId") ?? "";
  const emailAddress = await requireVerifiedInviteeEmail(userId);

  const organizationId = await prisma.$transaction(async (tx) => {
    const invite = await tx.organizationInvite.findFirst({
      where: { id: inviteId, emailAddress, expiresAt: { gt: new Date() } },
      select: { organizationId: true },
    });

    // Someone else's invite gets the same answer as a missing one.
    if (!invite) {
      throw createError({
        statusCode: 404,
        statusMessage: "This invite has expired or was withdrawn",
      });
    }

    // Already a member (a second tab, say) is the same result.
    await tx.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId,
        },
      },
      create: { organizationId: invite.organizationId, userId, role: "member" },
      update: {},
    });
    await tx.organizationInvite.delete({ where: { id: inviteId } });

    return invite.organizationId;
  });

  logwatch.info({
    action: "organization.invite.accept",
    message: "Invite accepted",
    userId,
    organizationId,
    inviteId,
  });

  return { organizationId };
});
