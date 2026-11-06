import type { MyOrganizationInvite } from "#shared/types/organization";
import {
  organizationAvatarUrl,
  organizationPath,
} from "#shared/utils/organization";
import {
  deleteExpiredOrganizationInvites,
  organizationInviteSentAt,
  organizationPersonName,
  requireVerifiedInviteeEmail,
} from "../../../utils/organizationInvites";

/** Invites waiting for the signed-in person, matched on their verified email. */
export default defineEventHandler(
  async (event): Promise<{ invites: MyOrganizationInvite[] }> => {
    const session = await requireDbUserSession(event);
    const emailAddress = await requireVerifiedInviteeEmail(session.user.id);

    await deleteExpiredOrganizationInvites({ emailAddress });

    const invites = await prisma.organizationInvite.findMany({
      where: { emailAddress },
      orderBy: { created: "asc" },
      select: {
        id: true,
        expiresAt: true,
        invitedBy: { select: { givenName: true, familyName: true } },
        organization: { select: { profileId: true, name: true } },
      },
    });

    return {
      invites: invites.map((invite) => ({
        id: invite.id,
        organizationName: invite.organization.name,
        organizationPath: organizationPath(invite.organization.profileId),
        organizationAvatarUrl: organizationAvatarUrl(
          invite.organization.profileId,
        ),
        invitedByName: organizationPersonName(invite.invitedBy),
        sentAt: organizationInviteSentAt(invite.expiresAt).toISOString(),
        expiresAt: invite.expiresAt.toISOString(),
      })),
    };
  },
);
