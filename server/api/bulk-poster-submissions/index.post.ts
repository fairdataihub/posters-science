import {
  BULK_IMPORT_NAME_MAX_LENGTH,
  BULK_IMPORT_NAME_MIN_LENGTH,
} from "#shared/types/bulkImportWizard";
import type { CreateBulkPosterSubmissionJobBody } from "#shared/types/bulkPosterSubmissionJob";
import { isBulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
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

  if (
    body.extractionMethod &&
    !isBulkSubmissionExtractionMethod(body.extractionMethod)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid extraction method",
    });
  }

  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.create({
    userId: session.user.id,
    name,
    managedConferenceId: body.managedConferenceId,
    extractionMethod: body.extractionMethod,
  });

  return job;
});
