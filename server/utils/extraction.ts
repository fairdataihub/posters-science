// Shared helpers for putting an ExtractionJob back on the queue. The external
// worker polls the database for pending jobs, so re-queuing is a status write
// plus an optional nudge to skip the wait until its next poll.

export type RequeueContext = "poster/job/retry" | "admin/extraction-jobs/retry";

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
  hasMetadata: boolean,
  context: RequeueContext,
) {
  const pending = await prisma.extractionJob.update({
    where: { id: jobId },
    data: {
      status: nextExtractionStatus(hasMetadata),
      completed: false,
      error: null,
    },
    select: { id: true, status: true, completed: true, error: true },
  });

  wakeExtractionWorker(jobId, context);

  return pending;
}
