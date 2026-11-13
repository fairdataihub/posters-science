import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { requireFeature } from "~~/server/utils/features";
import type { H3Event } from "h3";

/** A pending sheet for a few thousand posters with abstracts stays well under this. */
export const MAX_PENDING_SHEET_BYTES = 25 * 1024 * 1024;

/** Owner check shared by the pending sheet routes. */
export async function requirePosterSheetJob(event: H3Event) {
  requireFeature("poster_sheet_mapping", event);
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "Job id is required" });
  }
  const job = await getBulkPosterSubmissionJobRepository().getByIdForUser(
    jobId,
    session.user.id,
  );
  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  return job;
}
