// Connects Zenodo with a personal access token the user pasted in, the way to
// connect while the zenodoOAuth maintenance switch is on because Zenodo's
// OAuth code exchange keeps failing (zenodo/zenodo-rdm#1484). The token is
// checked with Zenodo before it is stored, it is only ever stored encrypted,
// and it never appears in a log, a response or an error.
import { z } from "zod";

const config = useRuntimeConfig();

// Bearer token characters from RFC 6750. Zenodo issues 60 character
// alphanumeric tokens; the looser bounds keep a format change on their side
// from locking users out.
const payloadSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20)
    .max(255)
    .regex(/^[\w.~+/-]+=*$/),
});

// Every check is a request to Zenodo made with a token we did not issue, so a
// user only gets a handful per window. Kept in memory, which is enough for the
// single app server.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, number[]>();

function allowAttempt(userId: string) {
  const now = Date.now();

  // Forget attempts that have aged out, for every user, so the map only holds
  // users seen in the last window, each with at most MAX_ATTEMPTS entries.
  for (const [id, times] of attempts) {
    const recent = times.filter((time) => now - time < WINDOW_MS);

    if (recent.length === 0) attempts.delete(id);
    else attempts.set(id, recent);
  }

  const recent = attempts.get(userId) ?? [];
  const allowed = recent.length < MAX_ATTEMPTS;

  if (allowed) attempts.set(userId, [...recent, now]);

  return allowed;
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;

  await assertZenodoNotOff();
  await assertNotInMaintenance("zenodoToken");

  if (!config.zenodoApiEndpoint || !isZenodoTokenEncryptionConfigured()) {
    console.error(
      "[Zenodo] Personal token connect is missing the API endpoint or encryption key",
    );

    throw createError({
      statusCode: 500,
      statusMessage: "Zenodo integration is not configured",
    });
  }

  // The zod issues are not passed on: they would echo the token back.
  const parsed = payloadSchema.safeParse(await readBody(event));

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "That doesn't look like a Zenodo token. Copy the whole token from Zenodo and paste it again.",
    });
  }

  if (!allowAttempt(userId)) {
    logwatch.warn({
      action: "zenodo.token.connect",
      message: "Personal token check refused: too many attempts",
      userId,
    });

    throw createError({
      statusCode: 429,
      statusMessage:
        "Too many attempts. Please wait a few minutes and try again.",
    });
  }

  const result = await connectZenodoPersonalToken(userId, parsed.data.token);

  if (result === "connected") {
    logwatch.info({
      action: "zenodo.token.connect",
      message: "Personal token connected",
      userId,
    });

    return { connected: true };
  }

  logwatch.warn({
    action: "zenodo.token.connect",
    message: `Personal token not connected: ${result}`,
    userId,
  });

  if (result === "rejected") {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Zenodo didn't accept this token. Check that you copied all of it and that it still exists in your Zenodo settings.",
    });
  }

  throw createError({
    statusCode: 503,
    statusMessage:
      "We couldn't reach Zenodo to check your token. Please try again in a few minutes.",
  });
});
