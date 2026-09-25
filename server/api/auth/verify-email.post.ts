import { z } from "zod";
import { createHash } from "node:crypto";
import { logwatch } from "../../utils/logwatch";

const verifySchema = z.object({
  token: z.string(),
});

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => verifySchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid or missing verification token",
    });
  }

  const tokenHash = createHash("sha256").update(body.data.token).digest("hex");

  // Find the user by hashed verification token.
  const user = await prisma.user.findUnique({
    where: {
      emailVerificationToken: tokenHash,
    },
  });

  if (!user) {
    logwatch.warn({
      action: "auth.verify-email",
      message: "Verification link did not match any account",
      reason: "invalid",
    });

    throw createError({
      statusCode: 404,
      statusMessage:
        "This verification link is not valid. Request a new one to continue.",
    });
  }

  // Verifying twice is not a failure. The token stays on the row after a
  // successful verification precisely so that a second click, whether a reload
  // or the link opened again from the inbox, is still recognized and reported
  // as success instead of as a broken link. Replaying a spent token does
  // nothing, since the only thing it can do is set a flag that is already set.
  // Checked ahead of the expiry test so a late second click reads as success
  // too.
  if (user.emailVerified) {
    logwatch.info({
      action: "auth.verify-email",
      message:
        "Verification link opened again for an account that is already verified",
      reason: "already-verified",
      userId: user.id,
    });

    return {
      message: "Your email address is already verified. You can log in.",
    };
  }

  // Check if the token has expired
  if (
    user.emailVerificationTokenExpires &&
    user.emailVerificationTokenExpires < new Date()
  ) {
    logwatch.warn({
      action: "auth.verify-email",
      message: "Verification link has expired",
      reason: "expired",
      userId: user.id,
      expiredAt: user.emailVerificationTokenExpires,
    });

    throw createError({
      statusCode: 410,
      statusMessage:
        "This verification link has expired. Request a new one to continue.",
    });
  }

  // Mark email as verified. The token is deliberately left in place, see above.
  await prisma.user.update({
    data: {
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    where: { id: user.id },
  });

  logwatch.info({
    action: "auth.verify-email",
    message: "Email verified",
    reason: "verified",
    userId: user.id,
  });

  return { message: "Email successfully verified! You can now log in." };
});
