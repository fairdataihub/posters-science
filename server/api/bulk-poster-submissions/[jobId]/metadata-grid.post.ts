import { z } from "zod";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { importBulkReviewGridRows } from "~~/server/utils/bulkReviewWorkbookImport";

const MAX_ROWS_PER_SHEET = 20_000;
const MAX_CELL_LENGTH = 100_000;

const bodySchema = z.object({
  sheets: z.record(
    z.string(),
    z
      .array(z.record(z.string(), z.string().max(MAX_CELL_LENGTH)))
      .max(MAX_ROWS_PER_SHEET),
  ),
});

/** Apply metadata edited in the in-app grid (replaces the xlsx upload). */
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

  const parsed = await readValidatedBody(event, (b) => bodySchema.safeParse(b));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid metadata payload",
      data: { issues: parsed.error.issues },
    });
  }

  const result = await importBulkReviewGridRows(
    session.user.id,
    job.submissionSummary,
    parsed.data.sheets,
  );

  if (!result.updatedPosterIds.length) {
    const firstError = result.issues.find((issue) => issue.severity === "error");
    throw createError({
      statusCode: 400,
      statusMessage: firstError?.message ?? "Could not save metadata",
      data: { issues: result.issues },
    });
  }

  return result;
});
