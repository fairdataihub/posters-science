import { validateBulkJobPosters } from "~~/server/utils/bulkReviewValidation";

/** Validate every poster in the batch in one request (used by the metadata grid). */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "Job id is required" });
  }

  return { posters: await validateBulkJobPosters(session.user.id, jobId) };
});
