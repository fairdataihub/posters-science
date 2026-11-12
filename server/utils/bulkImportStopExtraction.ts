import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { BULK_EXTRACTION_STOPPED_ERROR } from "#shared/bulkImportStopExtraction";
import { triggerPosterExtractionWorker } from "~~/server/utils/bulkImportSubmit";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import prisma from "~~/server/utils/prisma";

export type StopBulkExtractionsResult = {
  /** Queued jobs that were stopped before the worker picked them up. */
  stoppedCount: number;
};

export type ResumeBulkExtractionsResult = {
  /** Stopped jobs put back in the extraction queue. */
  resumedCount: number;
};

async function bulkImportPosterIds(
  userId: string,
  jobId: string,
): Promise<number[]> {
  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, userId);

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  return (summary.createdPosters ?? []).map((entry) => entry.posterId);
}

/** Puts every stopped extraction in a bulk import back in the queue. */
export async function resumeStoppedBulkExtractions(
  userId: string,
  jobId: string,
): Promise<ResumeBulkExtractionsResult> {
  const posterIds = await bulkImportPosterIds(userId, jobId);
  if (posterIds.length === 0) return { resumedCount: 0 };

  // Stopped jobs never started, so they go back exactly where they were.
  const { count } = await prisma.extractionJob.updateMany({
    where: {
      posterId: { in: posterIds },
      poster: { userId, status: { not: "published" } },
      completed: false,
      status: "failed",
      error: BULK_EXTRACTION_STOPPED_ERROR,
    },
    data: {
      status: "pending-extraction",
      error: null,
    },
  });

  if (count > 0) triggerPosterExtractionWorker();

  return { resumedCount: count };
}

/**
 * Stops every extraction in a bulk import that the worker has not started yet.
 * Posters already being processed finish normally; the model run cannot be
 * interrupted safely. Stopped jobs are stored as failed with
 * BULK_EXTRACTION_STOPPED_ERROR so the worker skips them until resumed.
 */
export async function stopQueuedBulkExtractions(
  userId: string,
  jobId: string,
): Promise<StopBulkExtractionsResult> {
  const posterIds = await bulkImportPosterIds(userId, jobId);
  if (posterIds.length === 0) return { stoppedCount: 0 };

  // Matching on the queued status makes this atomic against the worker: a job
  // it has already claimed is no longer "pending-extraction" and is left alone.
  const { count } = await prisma.extractionJob.updateMany({
    where: {
      posterId: { in: posterIds },
      poster: { userId, status: { not: "published" } },
      completed: false,
      status: "pending-extraction",
    },
    data: {
      status: "failed",
      error: BULK_EXTRACTION_STOPPED_ERROR,
    },
  });

  return { stoppedCount: count };
}
