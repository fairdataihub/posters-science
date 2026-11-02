import { createError } from "h3";
import prisma from "~~/server/utils/prisma";
import {
  requeueExtractionJob,
  type RetryExtractionJobResult,
} from "~~/server/utils/extraction";
import { triggerPosterExtractionWorker } from "~~/server/utils/bulkImportSubmit";

export type { RetryExtractionJobResult };

const RESTARTABLE_INCOMPLETE_STATUSES = new Set([
  "processing",
  "pending-thumbnail",
  "pending-extraction",
]);

export async function retryExtractionJobForUser(
  userId: string,
  jobId: string,
): Promise<RetryExtractionJobResult> {
  const job = await prisma.extractionJob.findFirst({
    where: {
      id: jobId,
      poster: { userId, status: { not: "published" } },
    },
    select: {
      id: true,
      status: true,
      completed: true,
      error: true,
      poster: {
        select: { posterMetadata: { select: { posterId: true } } },
      },
    },
  });

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Extraction job not found",
    });
  }

  if (job.completed && job.status === "completed") {
    throw createError({
      statusCode: 409,
      statusMessage: "Extraction already completed",
    });
  }

  const snapshot = {
    status: job.status,
    completed: job.completed,
    hasPosterMetadata: Boolean(job.poster.posterMetadata),
  };

  if (
    !job.completed &&
    job.status === "pending-extraction" &&
    !job.error?.trim()
  ) {
    triggerPosterExtractionWorker();
    return {
      status: job.status,
      completed: job.completed,
      error: job.error,
    };
  }

  const canRestart =
    job.status === "failed" ||
    (!job.completed && RESTARTABLE_INCOMPLETE_STATUSES.has(job.status));

  if (!canRestart) {
    throw createError({
      statusCode: 409,
      statusMessage: "This extraction job cannot be restarted",
    });
  }

  return requeueExtractionJob(job.id, snapshot, "poster/job/retry");
}
