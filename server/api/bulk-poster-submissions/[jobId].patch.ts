import type { UpdateBulkPosterSubmissionJobBody } from "#shared/types/bulkPosterSubmissionJob";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const body = await readBody<UpdateBulkPosterSubmissionJobBody>(event);
  const repository = getBulkPosterSubmissionJobRepository();

  try {
    return await repository.updateForUser(jobId, session.user.id, body ?? {});
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update bulk import",
    });
  }
});
