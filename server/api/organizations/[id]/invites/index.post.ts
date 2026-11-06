import type { OrganizationSentInvite } from "#shared/types/organization";
import {
  ORGANIZATION_INVITE_PENDING_MAX,
  organizationInviteSchema,
} from "#shared/utils/organization";
import { logwatch } from "../../../../utils/logwatch";
import {
  deleteExpiredOrganizationInvites,
  organizationInviteExpiry,
  organizationPersonName,
  organizationSentInviteSelect,
  requireInviteResendAllowed,
  sendOrganizationInviteEmail,
  toOrganizationSentInvite,
} from "../../../../utils/organizationInvites";
import { requireOrgOwner } from "../../../../utils/organizations";

/**
 * An owner invites someone by email. The response is the same whether or not
 * the address has an account, so an invite never reveals who has one. Inviting
 * an address that already has a pending invite sends it again.
 */
export default defineEventHandler(
  async (event): Promise<OrganizationSentInvite> => {
    const organizationId = getRouterParam(event, "id") ?? "";
    const { session } = await requireOrgOwner(event, organizationId);

    const body = await readValidatedBody(event, (b) =>
      organizationInviteSchema.safeParse(b),
    );

    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Enter a valid email address",
      });
    }

    const { emailAddress } = body.data;

    const [organization, inviter, existingMember] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true, hiddenAt: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
        select: { givenName: true, familyName: true },
      }),
      // Owners see the member list, so saying someone is already a member
      // reveals nothing new.
      prisma.organizationMember.findFirst({
        where: { organizationId, user: { emailAddress } },
        select: { id: true },
      }),
    ]);

    if (organization.hiddenAt) {
      throw createError({
        statusCode: 409,
        statusMessage:
          "This organization was hidden by the Posters.science team, so it can't invite people.",
      });
    }

    if (existingMember) {
      throw createError({
        statusCode: 409,
        statusMessage: "This person is already a member.",
      });
    }

    await deleteExpiredOrganizationInvites({ organizationId });

    const existing = await prisma.organizationInvite.findUnique({
      where: { organizationId_emailAddress: { organizationId, emailAddress } },
      select: { id: true, expiresAt: true },
    });

    let invite;

    if (existing) {
      requireInviteResendAllowed(existing.expiresAt);

      invite = await prisma.organizationInvite.update({
        where: { id: existing.id },
        data: {
          expiresAt: organizationInviteExpiry(),
          invitedById: session.user.id,
        },
        select: organizationSentInviteSelect,
      });
    } else {
      const pending = await prisma.organizationInvite.count({
        where: { organizationId },
      });

      if (pending >= ORGANIZATION_INVITE_PENDING_MAX) {
        throw createError({
          statusCode: 409,
          statusMessage: `This organization has ${ORGANIZATION_INVITE_PENDING_MAX} pending invites. Revoke some before inviting more people.`,
        });
      }

      try {
        invite = await prisma.organizationInvite.create({
          data: {
            organizationId,
            emailAddress,
            invitedById: session.user.id,
            expiresAt: organizationInviteExpiry(),
          },
          select: organizationSentInviteSelect,
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;

        throw createError({
          statusCode: 409,
          statusMessage: "This address was invited a moment ago.",
        });
      }
    }

    try {
      await sendOrganizationInviteEmail({
        id: invite.id,
        organizationId,
        organizationName: organization.name,
        inviterName: organizationPersonName(inviter),
        emailAddress,
        expiresAt: invite.expiresAt,
      });
    } catch (error) {
      // A new invite nobody was told about is removed, so the owner can try
      // again straight away. A resent one keeps its earlier email.
      if (!existing) {
        await prisma.organizationInvite.deleteMany({
          where: { id: invite.id },
        });
      }

      logwatch.error({
        action: "organization.invite",
        message: "Invite email could not be sent",
        userId: session.user.id,
        organizationId,
        inviteId: invite.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw createError({
        statusCode: 502,
        statusMessage: "The invite email could not be sent. Please try again.",
      });
    }

    logwatch.info({
      action: existing ? "organization.invite.resend" : "organization.invite",
      message: existing ? "Invite sent again" : "Invite created",
      userId: session.user.id,
      organizationId,
      inviteId: invite.id,
    });

    return toOrganizationSentInvite(invite);
  },
);
