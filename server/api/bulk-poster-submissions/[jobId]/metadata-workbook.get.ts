import { buildBulkReviewWorkbookBuffer } from "~~/server/utils/bulkReviewWorkbookFill";
import { loadBulkReviewJobPosters } from "~~/server/utils/bulkReviewJobPosters";

const INVALID_FILENAME_CHARS = /[^a-zA-Z0-9._-]+/g;

function safeWorkbookFilename(jobName: string, jobId: string) {
  const fromName = jobName
    .replace(INVALID_FILENAME_CHARS, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const base = fromName || `bulk-import-${jobId.slice(0, 8)}`;
  return `${base}-poster-metadata.xlsx`;
}

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const { job, batchConference, orderedPosters, extractionMethod } =
    await loadBulkReviewJobPosters(event, session.user.id, jobId);

  const buffer = await buildBulkReviewWorkbookBuffer(
    orderedPosters,
    extractionMethod,
    batchConference,
  );
  const filename = safeWorkbookFilename(job.name, job.id);

  setHeader(
    event,
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );

  return buffer;
});
