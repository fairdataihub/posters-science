// Connects Figshare with a personal token the user pasted in. The token is
// checked with Figshare before it is stored, it is only ever stored encrypted
// and deleted an hour later, and it never appears in a log, a response or an
// error.
import { z } from "zod";

// Figshare personal tokens are 128 hex characters; the looser bounds keep a
// format change on their side from locking users out.
const payloadSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20)
    .max(512)
    .regex(/^[\w.~+/-]+=*$/),
});

// Every check is a request to Figshare with a token we did not issue, so a
// user gets a handful per window. In memory, enough for the single app server.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, number[]>();

function allowAttempt(userId: string) {
  const now = Date.now();

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

  await assertNotInMaintenance("figshare");

  if (!isFigshareConfigured()) {
    console.error(
      "[Figshare] Personal token connect is missing the API endpoint or encryption key",
    );

    throw createError({
      statusCode: 500,
      statusMessage: "Figshare integration is not configured",
    });
  }

  // The zod issues are not passed on: they would echo the token back.
  const parsed = payloadSchema.safeParse(await readBody(event));

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "That doesn't look like a Figshare token. Copy the whole token from Figshare and paste it again.",
    });
  }

  if (!allowAttempt(userId)) {
    logwatch.warn({
      action: "figshare.token.connect",
      message: "Personal token check refused: too many attempts",
      userId,
    });

    throw createError({
      statusCode: 429,
      statusMessage:
        "Too many attempts. Please wait a few minutes and try again.",
    });
  }

  const result = await connectFigsharePersonalToken(userId, parsed.data.token);

  if (result === "connected") {
    logwatch.info({
      action: "figshare.token.connect",
      message: "Personal token connected",
      userId,
    });

    return { connected: true };
  }

  logwatch.warn({
    action: "figshare.token.connect",
    message: `Personal token not connected: ${result}`,
    userId,
  });

  if (result === "rejected") {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Figshare didn't accept this token. Check that you copied all of it and that it still exists on your Figshare Integrations page.",
    });
  }

  throw createError({
    statusCode: 503,
    statusMessage:
      "We couldn't reach Figshare to check your token. Please try again in a few minutes.",
  });
});
