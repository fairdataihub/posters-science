import { normalizeBulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import { posterIdsFromBulkSubmissionSummary } from "~~/server/utils/bulkImportDashboard";
import type { UpdateBulkPosterSubmissionJobBody } from "#shared/types/bulkPosterSubmissionJob";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const body = await readBody<UpdateBulkPosterSubmissionJobBody>(event);
  const repository = getBulkPosterSubmissionJobRepository();

  // Extraction jobs carry the level they were created with, so it cannot
  // change once any poster in the batch has been submitted for extraction.
  if (body?.extractionMethod !== undefined) {
    const current = await repository.getByIdForUser(jobId, session.user.id);
    const submittedCount = posterIdsFromBulkSubmissionSummary(
      current?.submissionSummary,
    ).length;
    if (
      current &&
      submittedCount > 0 &&
      normalizeBulkSubmissionExtractionMethod(body.extractionMethod) !==
        normalizeBulkSubmissionExtractionMethod(current.extractionMethod)
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: "Extraction level is locked",
        message:
          "The extraction level can't be changed after posters have been submitted for extraction.",
      });
    }
  }

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
