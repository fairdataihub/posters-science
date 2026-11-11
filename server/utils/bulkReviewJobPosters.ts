import type { H3Event } from "h3";
import { orderedBulkImportPosterEntries } from "~~/server/utils/bulkImportOrderedPosters";
import { ensurePostersScienceDiscoverRelatedIdentifier } from "~~/server/utils/postersScienceDiscoverRelatedIdentifier";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import type { BulkReviewPosterRow } from "~~/server/utils/bulkReviewWorkbookFill";
import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";

/**
 * Loads a bulk job and its posters (in batch order) for metadata review.
 * Shared by the in-app metadata grid and the legacy xlsx workbook endpoint.
 */
export async function loadBulkReviewJobPosters(
  event: H3Event,
  userId: string,
  jobId: string,
  options: { prepare?: boolean } = {},
) {
  // First open adds discover links per poster; a reload right after saving
  // the grid can skip that work.
  const prepare = options.prepare ?? true;
  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, userId);

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  const ordered = orderedBulkImportPosterEntries(job.submissionSummary);
  if (ordered.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "This bulk import has no posters yet.",
    });
  }

  const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  const batchConference = summary.conference ?? null;

  // The batch license and conference are copied onto posters after extraction
  // and when the conference or license step changes, not on every load.
  const posterIds = ordered.map((entry) => entry.posterId);

  if (prepare) {
    const config = useRuntimeConfig(event);
    const siteEnv = config.siteEnv || config.public.siteEnv;

    const completedJobs = await prisma.extractionJob.findMany({
      where: {
        posterId: { in: posterIds },
        completed: true,
      },
      select: { posterId: true },
    });
    for (const row of completedJobs) {
      if (row.posterId != null) {
        await ensurePostersScienceDiscoverRelatedIdentifier(row.posterId, {
          siteEnv,
        });
      }
    }
  }

  const posters = await prisma.poster.findMany({
    where: {
      id: { in: posterIds },
      userId,
    },
    include: {
      posterMetadata: true,
      extractionJob: { select: { fileName: true } },
    },
  });

  const posterById = new Map(posters.map((poster) => [poster.id, poster]));
  const orderedPosters: BulkReviewPosterRow[] = ordered
    .map((entry) => posterById.get(entry.posterId))
    .filter((poster): poster is NonNullable<typeof poster> => poster != null);

  if (orderedPosters.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "No poster records found for this bulk import.",
    });
  }

  return {
    job,
    batchConference,
    orderedPosters,
  };
}
