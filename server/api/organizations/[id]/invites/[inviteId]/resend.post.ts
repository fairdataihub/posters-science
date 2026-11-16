import type { OrganizationSentInvite } from "#shared/types/organization";
import { logwatch } from "../../../../../utils/logwatch";
import {
  organizationInviteExpiry,
  organizationPersonName,
  organizationSentInviteSelect,
  requireInviteResendAllowed,
  sendOrganizationInviteEmail,
  toOrganizationSentInvite,
} from "../../../../../utils/organizationInvites";
import { requireOrgOwner } from "../../../../../utils/organizations";

/** Emails a pending invite again and restarts its 14 days. */
export default defineEventHandler(
  async (event): Promise<OrganizationSentInvite> => {
    const organizationId = getRouterParam(event, "id") ?? "";
    const inviteId = getRouterParam(event, "inviteId") ?? "";
    const { session } = await requireOrgOwner(event, organizationId);

    const existing = await prisma.organizationInvite.findFirst({
      where: { id: inviteId, organizationId },
      select: {
        expiresAt: true,
        organization: { select: { name: true, hiddenAt: true } },
      },
    });

    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: "Invite not found" });
    }

    if (existing.organization.hiddenAt) {
      throw createError({
        statusCode: 409,
        statusMessage:
          "This organization was hidden by the Posters.science team, so it can't invite people.",
      });
    }

    requireInviteResendAllowed(existing.expiresAt);

    const [invite, inviter] = await Promise.all([
      prisma.organizationInvite.update({
        where: { id: inviteId },
        data: {
          expiresAt: organizationInviteExpiry(),
          invitedById: session.user.id,
        },
        select: organizationSentInviteSelect,
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
        select: { givenName: true, familyName: true },
      }),
    ]);

    try {
      await sendOrganizationInviteEmail({
        id: invite.id,
        organizationId,
        organizationName: existing.organization.name,
        inviterName: organizationPersonName(inviter),
        emailAddress: invite.emailAddress,
        expiresAt: invite.expiresAt,
      });
    } catch (error) {
      logwatch.error({
        action: "organization.invite.resend",
        message: "Invite email could not be sent again",
        userId: session.user.id,
        organizationId,
        inviteId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw createError({
        statusCode: 502,
        statusMessage: "The invite email could not be sent. Please try again.",
      });
    }

    logwatch.info({
      action: "organization.invite.resend",
      message: "Invite sent again",
      userId: session.user.id,
      organizationId,
      inviteId,
    });

    return toOrganizationSentInvite(invite);
  },
);
