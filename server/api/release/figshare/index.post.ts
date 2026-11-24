// Publishes a poster to the user's Figshare account, streaming each step to
// the browser as server-sent events (same shape as /api/release/zenodo).
import { z } from "zod";

const payloadSchema = z.object({
  posterId: z.coerce.number().int().positive(),
  licenseId: z.number().int().positive(),
  categoryIds: z.array(z.number().int().positive()).min(1).max(50),
});

// One publication per poster at a time, so two tabs cannot both create an
// item. In memory, enough for the single app server.
const inFlight = new Set<number>();

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;

  await assertNotInMaintenance("figshare");

  const parsed = payloadSchema.safeParse(await readBody(event));

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose a license and at least one category.",
    });
  }

  const { posterId, licenseId, categoryIds } = parsed.data;

  if (inFlight.has(posterId)) {
    throw createError({
      statusCode: 409,
      statusMessage: "This poster is already being published. Please wait.",
    });
  }

  inFlight.add(posterId);

  setResponseHeaders(event, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const { res } = event.node;
  let clientConnected = true;

  res.on("close", () => {
    clientConnected = false;
  });

  const sendEvent = (data: Record<string, unknown>) => {
    if (clientConnected && !res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const result = await beginFigsharePublication({
      posterId,
      userId,
      categoryIds,
      licenseId,
      onProgress: (progress) => sendEvent(progress),
    });

    if (result.success) {
      const { draftOnly, underReview } = result.data;

      logwatch.info({
        action: "figshare.publish",
        message: draftOnly
          ? "Created a private Figshare draft (draft-only site)"
          : underReview
            ? "Submitted to Figshare, waiting for the institution's review"
            : "Published to Figshare",
        userId,
        posterId,
        articleId: result.data.articleId,
      });

      sendEvent({
        step: "complete",
        status: "completed",
        message: draftOnly
          ? "Private draft ready on Figshare"
          : underReview
            ? "Submitted to Figshare for review"
            : "Successfully published to Figshare!",
        data: result.data,
      });
    } else {
      logwatch.warn({
        action: "figshare.publish",
        message: `Figshare publication failed: ${result.error}`,
        userId,
        posterId,
      });

      sendEvent({ step: "error", status: "error", message: result.error });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    logwatch.error({
      action: "figshare.publish",
      message: `Unexpected error during Figshare publication: ${detail}`,
      userId,
      posterId,
    });

    sendEvent({
      step: "error",
      status: "error",
      message: `Unexpected error during publication: ${detail}`,
    });
  } finally {
    inFlight.delete(posterId);
  }

  if (!res.writableEnded) res.end();
});
