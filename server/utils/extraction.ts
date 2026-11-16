// Shared helpers for putting an ExtractionJob back on the queue. The external
// worker polls the database for pending jobs, so re-queuing is a status write
// plus an optional nudge to skip the wait until its next poll.

export type RequeueContext =
  | "poster/job/retry"
  | "admin/extraction-jobs/retry"
  | "batch/upload"
  | "batch/retry";

// A job is in flight until it reaches one of these.
export const TERMINAL_EXTRACTION_STATUSES = ["completed", "failed"];

export function isInFlightExtractionStatus(status: string) {
  return !TERMINAL_EXTRACTION_STATUSES.includes(status);
}

/**
 * Re-queue only the work that is actually missing. A draft that copied its
 * metadata has nothing to extract, and re-running extraction would overwrite
 * the fields the user is about to edit.
 */
export function nextExtractionStatus(hasMetadata: boolean) {
  return hasMetadata ? "pending-thumbnail" : "pending-extraction";
}

export type RequeueExtractionJobSnapshot = {
  status: string;
  completed: boolean;
  hasPosterMetadata: boolean;
};

export type RetryExtractionJobResult = {
  status: string;
  completed: boolean;
  error: string | null;
};

/**
 * Bulk posters always have a metadata row (batch conference/license) before
 * extraction runs. Use job completion, not row presence, to decide whether
 * to re-run extraction or only refresh the thumbnail.
 */
export function resolveRequeueExtractionStatus(
  job: RequeueExtractionJobSnapshot,
): "pending-extraction" | "pending-thumbnail" {
  if (!job.completed) {
    return "pending-extraction";
  }

  if (job.status === "completed" && job.hasPosterMetadata) {
    return "pending-thumbnail";
  }

  return "pending-extraction";
}

/**
 * Fire and forget wake up call. A failed wake is not a failed retry, so this
 * never throws.
 */
export function wakeExtractionWorker(jobId: string, context: RequeueContext) {
  const { posterExtractionApi } = useRuntimeConfig();

  if (!posterExtractionApi) return;

  setImmediate(async () => {
    try {
      await fetch(`${posterExtractionApi}/jobs/check`, { method: "POST" });
    } catch (error) {
      console.error(
        `[${context}] Could not wake the worker for job ${jobId}; it will be picked up on the next poll`,
        error,
      );
    }
  });
}

export async function requeueExtractionJob(
  jobId: string,
  job: RequeueExtractionJobSnapshot,
  context: RequeueContext,
) {
  const stored = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    select: { fileUploaded: true },
  });
  if (stored && !stored.fileUploaded) {
    throw createError({
      statusCode: 409,
      statusMessage: "Upload the original file before retrying extraction",
    });
  }

  const status = resolveRequeueExtractionStatus(job);

  const pending = await prisma.extractionJob.update({
    where: { id: jobId },
    data: {
      status,
      completed: false,
      error: null,
    },
    select: {
      id: true,
      status: true,
      completed: true,
      error: true,
      posterId: true,
    },
  });

  wakeExtractionWorker(jobId, context);

  return pending;
}
