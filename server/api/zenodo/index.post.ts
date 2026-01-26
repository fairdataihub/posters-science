// Endpoint to begin the Zenodo arhival publication workflow
// Will take the Zenodo token stored in the database, the poster
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

  const query = getQuery(event);
  const { posterId, mode, existingDepositionId } = payloadSchema.parse(query);

  const { zenodoToken, message, existingDepositions } =
    await validateZenodoToken(userId);

  const status = await publishToZenodo(
    posterId,
    mode,
    existingDepositionId,
    userId,
    zenodoToken,
  );

  if (!status.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Failed to publish to Zenodo",
      data: status.error,
    });
  }

  return { status };
});
