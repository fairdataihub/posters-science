import {
  issueEmailVerification,
  sentWithinResendCooldown,
} from "../../../utils/issueEmailVerification";
import { logwatch } from "../../../utils/logwatch";
import { readOrcidFlow } from "../../../utils/orcidSignIn";

// A new verification link for the account made through ORCID in this browser.
// It reads the account from the sealed cookie, never from the request, so it
// can't be used to mail an address someone else typed.
export default defineEventHandler(async (event) => {
  const flow = await readOrcidFlow(event);

  if (flow?.stage !== "unverified" || !flow.pendingUserId) {
    throw createError({
      statusCode: 410,
      statusMessage: "Your ORCID sign-in expired. Sign in with ORCID again.",
      data: { reason: "expired" },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: flow.pendingUserId },
  });

  if (!user || user.emailVerified) return { success: true };

  if (sentWithinResendCooldown(user.emailVerificationTokenExpires)) {
    logwatch.info({
      action: "auth.resend-verification",
      message: "Resend skipped because a link was sent within the cooldown",
      userId: user.id,
      via: "orcid",
    });

    return { success: true };
  }

  await issueEmailVerification(user);

  logwatch.info({
    action: "auth.resend-verification",
    message: "New verification email issued",
    userId: user.id,
    via: "orcid",
  });

  return { success: true };
});
