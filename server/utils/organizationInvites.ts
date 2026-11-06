import dayjs from "dayjs";
import type { OrganizationSentInvite } from "#shared/types/organization";
import {
  ORGANIZATION_INVITE_RESEND_COOLDOWN_MINUTES,
  ORGANIZATION_INVITE_TTL_DAYS,
} from "#shared/utils/organization";
import { logwatch } from "./logwatch";
import { sendEmail } from "./sendEmail";

// Invites to join an organization. An invite is accepted by the person whose
// verified account email matches it, so no secret token is stored or mailed.

export function organizationInviteExpiry(): Date {
  return dayjs().add(ORGANIZATION_INVITE_TTL_DAYS, "day").toDate();
}

/**
 * Sending an invite sets its expiry, so the last send is the expiry minus the
 * lifetime. This gives a resend cooldown without another column.
 */
export function organizationInviteSentAt(expiresAt: Date): Date {
  return dayjs(expiresAt)
    .subtract(ORGANIZATION_INVITE_TTL_DAYS, "day")
    .toDate();
}

export function organizationInviteResendAt(expiresAt: Date): Date {
  return dayjs(organizationInviteSentAt(expiresAt))
    .add(ORGANIZATION_INVITE_RESEND_COOLDOWN_MINUTES, "minute")
    .toDate();
}

/** A 429 while the last email for this invite is still recent. */
export function requireInviteResendAllowed(expiresAt: Date) {
  const resendAt = dayjs(organizationInviteResendAt(expiresAt));

  if (resendAt.isAfter(dayjs())) {
    const minutes = Math.max(
      1,
      Math.ceil(resendAt.diff(dayjs(), "second") / 60),
    );

    throw createError({
      statusCode: 429,
      statusMessage: `An invite was just sent to this address. You can send it again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
    });
  }
}

export const organizationSentInviteSelect = {
  id: true,
  emailAddress: true,
  expiresAt: true,
  invitedBy: { select: { givenName: true, familyName: true } },
} as const;

export function toOrganizationSentInvite(invite: {
  id: string;
  emailAddress: string;
  expiresAt: Date;
  invitedBy: { givenName: string; familyName: string };
}): OrganizationSentInvite {
  return {
    id: invite.id,
    emailAddress: invite.emailAddress,
    invitedByName: organizationPersonName(invite.invitedBy),
    sentAt: organizationInviteSentAt(invite.expiresAt).toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    resendAvailableAt: organizationInviteResendAt(
      invite.expiresAt,
    ).toISOString(),
  };
}

/** Expired invites are deleted when they are next looked at. */
export async function deleteExpiredOrganizationInvites(where: {
  organizationId?: string;
  emailAddress?: string;
}) {
  await prisma.organizationInvite.deleteMany({
    where: { ...where, expiresAt: { lte: new Date() } },
  });
}

export function organizationPersonName(person: {
  givenName: string;
  familyName: string;
}) {
  return `${person.givenName} ${person.familyName}`.trim() || "A member";
}

// Organization and person names are chosen by users and go into HTML.
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(String.fromCharCode(34), "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Emails an invite. Someone with an account is sent to their organizations
 * list; anyone else is asked to sign up with the invited address. The owner
 * gets the same response either way. Nothing is sent in development, which has
 * no email provider.
 */
export async function sendOrganizationInviteEmail(invite: {
  id: string;
  organizationId: string;
  organizationName: string;
  inviterName: string;
  emailAddress: string;
  expiresAt: Date;
}) {
  const config = useRuntimeConfig();
  const siteEnv = config.siteEnv || config.public.siteEnv;
  const logContext = {
    purpose: "organization-invite",
    organizationId: invite.organizationId,
    inviteId: invite.id,
  };

  if (siteEnv === "development" || siteEnv === "dev") {
    logwatch.info({
      ...logContext,
      action: "organization.invite.email",
      message: "Invite email skipped in development",
    });

    return;
  }

  const account = await prisma.user.findUnique({
    where: { emailAddress: invite.emailAddress },
    select: { id: true },
  });

  const signupQuery = new URLSearchParams({
    email: invite.emailAddress,
    redirect: "/organizations",
  });
  const link = account
    ? `${config.siteUrl}/organizations`
    : `${config.siteUrl}/signup?${signupQuery}`;
  const buttonLabel = account ? "View invitation" : "Sign up to join";
  const accountLine = account
    ? "Log in with this email address to accept or decline the invitation."
    : `Sign up with this email address (${escapeHtml(invite.emailAddress)}), then log in to accept or decline the invitation.`;

  const organizationName = escapeHtml(invite.organizationName);
  const inviterName = escapeHtml(invite.inviterName);
  const expiry = dayjs(invite.expiresAt).format("MMMM D, YYYY");

  await sendEmail({
    to: invite.emailAddress,
    subject: `You're invited to join ${invite.organizationName} on Posters.science`,
    logContext,
    html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333;">
  <h2 style="color: #1a1a1a;">You're invited to join an organization</h2>
  <p>${inviterName} invited you to join <strong>${organizationName}</strong> on Posters.science.</p>
  <p>Members can show the posters they published or claimed on the organization's page. Each poster stays with the person who shared it.</p>
  <p>${accountLine}</p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${link}"
       style="background-color: #4F46E5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
      ${buttonLabel}
    </a>
  </div>
  <p style="font-size: 13px; color: #666;">
    If the button doesn't work, copy and paste this link into your browser:<br/>
    <a href="${link}" style="color: #4F46E5; word-break: break-all;">${link}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">This invitation expires on <strong>${expiry}</strong>. If you weren't expecting it, you can ignore this email.</p>
  <p style="font-size: 13px; color: #555;">~ Posters.science</p>
</div>
      `,
  });
}

/**
 * The signed-in person's verified address, which an invite must match. Login
 * already needs a verified address, but the check is repeated here because it
 * is the only thing that proves the invite is theirs.
 */
export async function requireVerifiedInviteeEmail(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { emailAddress: true, emailVerified: true },
  });

  if (!user.emailVerified) {
    throw createError({
      statusCode: 403,
      statusMessage: "Verify your email address to answer invites.",
    });
  }

  return user.emailAddress.toLowerCase();
}
