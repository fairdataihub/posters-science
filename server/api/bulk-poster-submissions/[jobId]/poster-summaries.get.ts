import { bulkJobPosterSummaries } from "~~/server/utils/bulkReviewValidation";

/**
 * Preview status (thumbnail, extraction) and required-field validation for
 * every poster in the batch, in one request. Poster Previews uses this for its
 * list and checkmarks, then loads full metadata only for the poster you open.
 */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "Job id is required" });
  }

  return { posters: await bulkJobPosterSummaries(session.user.id, jobId) };
});
