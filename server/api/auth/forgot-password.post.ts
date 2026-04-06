import { z } from "zod";
import { randomBytes } from "crypto";
import { sendEmail } from "../../utils/sendEmail";

const schema = z.object({
  email: z.email("Must be a valid email address"),
});

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => schema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid email address",
    });
  }

  const { email } = body.data;

  const user = await prisma.user.findUnique({
    where: { emailAddress: email },
    select: { id: true, givenName: true },
  });

  // Always return success to avoid email enumeration
  if (!user) {
    return { success: true };
  }

  // Delete any existing reset tokens for this user
  await prisma.userForgotPassword.deleteMany({
    where: { userId: user.id },
  });

  const resetToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.userForgotPassword.create({
    data: {
      userId: user.id,
      resetToken,
      expiresAt,
    },
  });

  const config = useRuntimeConfig();
  const resetUrl = `${config.siteUrl}/reset-password?token=${resetToken}`;

  await sendEmail({
    to: email,
    subject: "Reset your password — Posters.science",
    html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333;">
  <h2 style="color: #1a1a1a;">Reset Your Password</h2>
  <p>Hi${user.givenName ? ` ${user.givenName}` : ""},</p>
  <p>We received a request to reset your password on Posters.science. Click the button below to choose a new password:</p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${resetUrl}"
       style="background-color: #4F46E5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
      Reset My Password
    </a>
  </div>
  <p style="font-size: 13px; color: #666;">
    If the button doesn't work, copy and paste this link into your browser:<br/>
    <a href="${resetUrl}" style="color: #4F46E5; word-break: break-all;">${resetUrl}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">
    This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your account remains secure.
  </p>
  <p style="font-size: 13px; color: #555;">~ Posters.science</p>
</div>
    `,
  });

  return { success: true };
});
