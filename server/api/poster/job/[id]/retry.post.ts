import { retryExtractionJobForUser } from "~~/server/utils/extractionJobRetry";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { id: jobId } = event.context.params as { id: string };

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job ID is required",
    });
  }

  return await retryExtractionJobForUser(session.user.id, jobId);
});
