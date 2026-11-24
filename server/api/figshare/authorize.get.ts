// Starts Sign in with Figshare. The state carries a random value, also kept
// in a short-lived cookie, and the poster to return to. The callback checks
// both, so a sign-in link made by someone else cannot attach their Figshare
// account to this user.
import { randomBytes } from "node:crypto";
import { z } from "zod";

const querySchema = z.object({
  posterId: z.string().regex(/^\d+$/),
});

const FIGSHARE_STATE_COOKIE = "figshare_oauth_state";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  await assertNotInMaintenance("figshare");

  if (!isFigshareOAuthConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: "Sign in with Figshare is not available.",
    });
  }

  const parsed = querySchema.safeParse(getQuery(event));

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Missing poster" });
  }

  const nonce = randomBytes(24).toString("base64url");

  setCookie(event, FIGSHARE_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: !import.meta.dev,
    path: "/api/figshare",
    maxAge: 10 * 60,
  });

  return sendRedirect(
    event,
    figshareAuthorizeUrl(`${nonce}.${parsed.data.posterId}`),
  );
});
