import { submitBulkPosterSubmissionJob } from "~~/server/utils/bulkImportSubmit";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  return await submitBulkPosterSubmissionJob(session.user.id, jobId);
});
