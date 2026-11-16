import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { updateBulkJobBodySchema } from "~~/server/utils/bulkJobPatchBody";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const body = await readValidatedBody(event, updateBulkJobBodySchema.parse);
  const repository = getBulkPosterSubmissionJobRepository();

  const job = await repository.getByIdForUser(jobId, session.user.id);
  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  // Merge into the stored summary here, so the client never sends it whole.
  const { name, wizardStep, conference, uniformLicense, reviewEmbargo } = body;
  const summary =
    conference || uniformLicense || reviewEmbargo
      ? {
          ...((job.submissionSummary ?? {}) as BulkImportSubmissionSummary),
          ...(conference && { conference }),
          ...(uniformLicense && { uniformLicense }),
          ...(reviewEmbargo && {
            reviewEmbargoEnabled: reviewEmbargo.enabled,
            reviewEmbargoDays: reviewEmbargo.enabled
              ? reviewEmbargo.days
              : undefined,
          }),
        }
      : undefined;

  try {
    return await repository.updateForUser(jobId, session.user.id, {
      ...(name !== undefined && { name }),
      ...(wizardStep && { wizardStep }),
      ...(summary && { submissionSummary: summary }),
    });
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
