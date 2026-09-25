import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import dayjs from "dayjs";
import {
  EMAIL_VERIFICATION_TTL_MINUTES,
  emailVerificationTtlLabel,
} from "#shared/utils/emailVerification";
import { sendEmail } from "./sendEmail";

/**
 * Issue a fresh verification token for a user and email them the link.
 *
 * Signup and the resend endpoint both go through here so token lifetime,
 * storage shape and email copy can only ever be defined in one place.
 */
export const issueEmailVerification = async (user: {
  id: string;
  emailAddress: string;
  givenName: string;
}) => {
  const config = useRuntimeConfig();

  const rawVerificationToken = nanoid();
  const verificationTokenHash = createHash("sha256")
    .update(rawVerificationToken)
    .digest("hex");
  const tokenExpiry = dayjs()
    .add(EMAIL_VERIFICATION_TTL_MINUTES, "minute")
    .toDate();

  // Issuing a new link invalidates the previous one, since a user row holds a
  // single token.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: verificationTokenHash,
      emailVerificationTokenExpires: tokenExpiry,
    },
  });

  const verificationLink = `${config.siteUrl}/verify-email?token=${encodeURIComponent(rawVerificationToken)}`;
  const expiryLabel = emailVerificationTtlLabel();

  await sendEmail({
    to: user.emailAddress,
    subject: "Verify your email address - Posters.science",
    logContext: { purpose: "email-verification", userId: user.id },
    html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333;">
  <h2 style="color: #1a1a1a;">Confirm Your Email Address</h2>
  <p>Hi ${user.givenName},</p>
  <p>Thanks for signing up to Posters.science! Please verify your email address by clicking the button below.</p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${verificationLink}"
       style="background-color: #4F46E5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
      Verify My Email
    </a>
  </div>
  <p style="font-size: 13px; color: #666;">
    If the button doesn't work, copy and paste this link into your browser:<br/>
    <a href="${verificationLink}" style="color: #4F46E5; word-break: break-all;">${verificationLink}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">This link expires in <strong>${expiryLabel}</strong>. If it expires, open the link anyway to request a new one, or request one from the login page. If you didn't create an account, you can safely ignore this email.</p>
  <p style="font-size: 13px; color: #555;">~ Posters.science</p>
</div>
      `,
  });
};
