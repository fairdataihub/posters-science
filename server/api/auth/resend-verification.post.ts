import { z } from "zod";
import { createHash } from "node:crypto";
import dayjs from "dayjs";
import {
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MINUTES,
  EMAIL_VERIFICATION_TTL_MINUTES,
} from "#shared/utils/emailVerification";
import { issueEmailVerification } from "../../utils/issueEmailVerification";
import { logwatch } from "../../utils/logwatch";

// Either identifier works. The signup and login screens know the address,
// while the verify screen only holds the expired token from the URL and should
// not have to ask the user to retype anything.
const schema = z
  .object({
    email: z.email().optional(),
    token: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.email || value.token), {
    message: "An email address or verification token is required",
  });

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => schema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid request",
    });
  }

  const user = body.data.token
    ? await prisma.user.findUnique({
        where: {
          emailVerificationToken: createHash("sha256")
            .update(body.data.token)
            .digest("hex"),
        },
      })
    : await prisma.user.findUnique({
        where: { emailAddress: body.data.email!.trim().toLowerCase() },
      });

  const via = body.data.token ? "token" : "email";

  // Always report success. This route is public, so distinguishing "no such
  // account" from "already verified" from "sent" would let anyone test which
  // addresses are registered. The logs are internal, so they record which case
  // it actually was.
  if (!user) {
    logwatch.info({
      action: "auth.resend-verification",
      message: "Resend requested with no matching account",
      via,
    });

    return { success: true };
  }

  if (user.emailVerified) {
    logwatch.info({
      action: "auth.resend-verification",
      message: "Resend requested for an account that is already verified",
      userId: user.id,
      via,
    });

    return { success: true };
  }

  // The last send time is the stored expiry minus the lifetime, so a burst of
  // requests cannot repeatedly mail the address without any extra storage.
  if (user.emailVerificationTokenExpires) {
    const issuedAt = dayjs(user.emailVerificationTokenExpires).subtract(
      EMAIL_VERIFICATION_TTL_MINUTES,
      "minute",
    );
    const cooldownStart = dayjs().subtract(
      EMAIL_VERIFICATION_RESEND_COOLDOWN_MINUTES,
      "minute",
    );

    if (issuedAt.isAfter(cooldownStart)) {
      logwatch.info({
        action: "auth.resend-verification",
        message: "Resend skipped because a link was sent within the cooldown",
        userId: user.id,
        via,
      });

      return { success: true };
    }
  }

  await issueEmailVerification(user);

  logwatch.info({
    action: "auth.resend-verification",
    message: "New verification email issued",
    userId: user.id,
    via,
  });

  return { success: true };
});
