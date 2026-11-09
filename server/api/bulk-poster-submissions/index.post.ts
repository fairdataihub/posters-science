import {
  BULK_IMPORT_NAME_MAX_LENGTH,
  BULK_IMPORT_NAME_MIN_LENGTH,
} from "#shared/types/bulkImportWizard";
import type { CreateBulkPosterSubmissionJobBody } from "#shared/types/bulkPosterSubmissionJob";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { requireFeature } from "~~/server/utils/features";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  // Starting a new batch is staging-only (NUXT_FEATURES); batches already
  // started can still be finished.
  requireFeature("bulk_extraction", event);
  const body = await readBody<CreateBulkPosterSubmissionJobBody>(event);

  const name = body?.name?.trim() ?? "";
  if (
    name.length < BULK_IMPORT_NAME_MIN_LENGTH ||
    name.length > BULK_IMPORT_NAME_MAX_LENGTH
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid import name",
    });
  }

  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.create({
    userId: session.user.id,
    name,
    managedConferenceId: body.managedConferenceId,
  });

  return job;
});
