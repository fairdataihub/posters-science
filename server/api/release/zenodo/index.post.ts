// Endpoint to begin the Zenodo archival publication workflow
// Streams progress events via SSE as each step completes
import { z } from "zod";
import { cleanupFailedNewZenodoDeposition } from "../../../utils/zenodo";

const payloadSchema = z.object({
  posterId: z.string(),
  mode: z.enum(["new", "existing"]).default("new"),
  existingDepositionId: z.number().optional(),
  license: z.string().optional(),
  version: z.string().trim().min(1).max(100).optional(),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  const body = await readBody(event);
  console.log("Received Zenodo publication request:", JSON.stringify(body));

  const parsed = payloadSchema.safeParse(body);

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid request payload",
      data: parsed.error.issues,
    });
  }

  const { posterId, mode, existingDepositionId, license, version } =
    parsed.data;

  // Publishing only needs the boolean, not the record list.
  const { zenodoToken, message } = await validateZenodoToken(userId, {
    includeRecords: false,
  });

  if (!zenodoToken) {
    throw createError({
      statusCode: 400,
      statusMessage: message || "Invalid Zenodo token, please sign in again",
    });
  }

  // Set up SSE streaming response
  setResponseHeaders(event, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const { res } = event.node;
  let clientConnected = true;

  res.on("close", () => {
    // Client disconnected by closing the browser tab or navigating away
    clientConnected = false;
  });

  const sendEvent = (data: Record<string, unknown>) => {
    if (clientConnected && !res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const status = await beginZenodoPublication(
      posterId,
      mode,
      existingDepositionId,
      userId,
      (progress) => sendEvent(progress),
      license,
      version,
    );

    if (!status.success) {
      sendEvent({
        step: "error",
        status: "error",
        message: status.error || "Failed to publish to Zenodo",
      });
    } else {
      sendEvent({
        step: "complete",
        status: "completed",
        message: "Successfully published to Zenodo!",
        data: status.data,
      });
    }
  } catch (error) {
    console.error("[Zenodo] Unexpected error during publication:", error);

    if (mode === "new") {
      await cleanupFailedNewZenodoDeposition(Number(posterId), userId);
    }

    // Keep the real message: a generic string here makes shared screenshots
    // untraceable, and this branch catches network throws and Prisma errors.
    const detail = error instanceof Error ? error.message : String(error);

    sendEvent({
      step: "error",
      status: "error",
      message: `Unexpected error during publication: ${detail}`,
    });
  }

  if (!res.writableEnded) {
    res.end();
  }
});
