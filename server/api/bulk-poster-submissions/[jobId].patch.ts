import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { updateBulkJobBodySchema } from "~~/server/utils/bulkJobPatchBody";
import { currentWizardRelease } from "~~/server/utils/bulkImportWizardRelease";
import { assertWorksheetNotHeld } from "~~/server/utils/bulkWorksheetHold";

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
  const {
    name,
    wizardStep,
    releaseSeen,
    conference,
    uniformLicense,
    reviewEmbargo,
  } = body;
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

  // A held batch stays on the first step until its worksheet is released.
  if (wizardStep && wizardStep !== "upload") {
    await assertWorksheetNotHeld(jobId);
  }

  try {
    return await repository.updateForUser(jobId, session.user.id, {
      ...(name !== undefined && { name }),
      ...(wizardStep && { wizardStep }),
      ...(releaseSeen && {
        wizardRelease: Math.max(job.wizardRelease ?? 0, currentWizardRelease()),
      }),
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
