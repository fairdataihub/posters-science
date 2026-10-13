import { CONFERENCE_BULK_IMPORT_LICENSE_FILE_BASENAME } from "#shared/types/conferenceBulkImport";
import { buildFilledBulkImportLicenseXlsx } from "~~/server/utils/bulkImportLicenseWorkbook";
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

  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, session.user.id);

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk submission not found",
    });
  }

  const posterFileNames = (job.stagedPosters ?? []).map((poster) => poster.fileName);

  if (posterFileNames.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "No staged posters",
      message: "Upload poster files before downloading the license workbook.",
    });
  }

  const body = await buildFilledBulkImportLicenseXlsx(posterFileNames);

  setResponseHeader(
    event,
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  setResponseHeader(
    event,
    "Content-Disposition",
    `attachment; filename="${CONFERENCE_BULK_IMPORT_LICENSE_FILE_BASENAME}.xlsx"`,
  );

  return body;
});
