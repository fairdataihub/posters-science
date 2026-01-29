// Endpoint to begin the Zenodo archival publication workflow
// Streams progress events via SSE as each step completes
import { z } from "zod";

const payloadSchema = z.object({
  posterId: z.string(),
  mode: z.enum(["new", "existing"]).default("new"),
  existingDepositionId: z.number().optional(),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  const body = await readBody(event);
  console.log("Received Zenodo publication request:", JSON.stringify(body));
  const { posterId, mode, existingDepositionId } = payloadSchema.parse(body);

  const { zenodoToken } = await validateZenodoToken(userId);

  if (!zenodoToken) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid Zenodo token, please sign in again",
    });
  }

  // Set up SSE streaming response
  setResponseHeaders(event, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const res = event.node.res;
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

    sendEvent({
      step: "error",
      status: "error",
      message: "An unexpected error occurred during publication",
    });
  }

  if (!res.writableEnded) {
    res.end();
  }
});
