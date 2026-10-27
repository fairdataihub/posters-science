import { retryExtractionJobForUser } from "~~/server/utils/extractionJobRetry";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  // Only the extraction switch applies here. The versioning switch pauses
  // starting a new version; this draft already exists, so letting the user
  // finish it is the point of "drafts in progress stay editable".
  await assertNotInMaintenance("extraction");

  const { id: jobId } = event.context.params as { id: string };

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job ID is required",
    });
  }

  return await retryExtractionJobForUser(session.user.id, jobId);
});
