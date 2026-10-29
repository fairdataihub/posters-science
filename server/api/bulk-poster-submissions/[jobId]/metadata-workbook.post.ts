import { readMultipartFormData } from "h3";
import { importBulkReviewWorkbookFromBuffer } from "~~/server/utils/bulkReviewWorkbookImport";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

const MAX_WORKBOOK_BYTES = 12 * 1024 * 1024;

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
      statusMessage: "Bulk import not found",
    });
  }

  const formData = await readMultipartFormData(event);
  const filePart = formData?.find(
    (part) => part.name === "workbook" || part.name === "file",
  );

  if (!filePart?.data?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Workbook file is required",
      message: 'Upload the metadata spreadsheet as form field "workbook".',
    });
  }

  if (filePart.data.length > MAX_WORKBOOK_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: "Workbook file is too large",
    });
  }

  const filename = filePart.filename?.toLowerCase() ?? "";
  if (filename && !filename.endsWith(".xlsx")) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid file type",
      message: "Upload an .xlsx metadata review workbook.",
    });
  }

  const result = await importBulkReviewWorkbookFromBuffer(
    session.user.id,
    job.submissionSummary,
    Buffer.from(filePart.data),
  );

  if (!result.updatedPosterIds.length) {
    const firstError = result.issues.find((issue) => issue.severity === "error");
    throw createError({
      statusCode: 400,
      statusMessage: firstError?.message ?? "Could not import workbook",
      data: { issues: result.issues },
    });
  }

  return result;
});
