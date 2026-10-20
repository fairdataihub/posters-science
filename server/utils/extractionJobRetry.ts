import { createError } from "h3";
import prisma from "~~/server/utils/prisma";
import { triggerPosterExtractionWorker } from "~~/server/utils/bulkImportSubmit";

export type RetryExtractionJobResult = {
  status: string;
  completed: boolean;
  error: string | null;
};

export async function retryExtractionJobForUser(
  userId: string,
  jobId: string,
): Promise<RetryExtractionJobResult> {
  const job = await prisma.extractionJob.findFirst({
    where: { id: jobId, poster: { userId } },
    select: {
      id: true,
      status: true,
      poster: {
        select: {
          status: true,
          automated: true,
          posterMetadata: { select: { posterId: true } },
        },
      },
    },
  });

  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Job not found" });
  }

  if (job.poster.status === "published") {
    throw createError({
      statusCode: 400,
      statusMessage: "Published posters cannot be retried",
    });
  }

  if (job.status !== "failed") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only failed extraction jobs can be retried",
    });
  }

  // Bulk-import posters always re-run full extraction. Version drafts that
  // already copied metadata only need a thumbnail pass.
  const nextStatus =
    job.poster.automated || !job.poster.posterMetadata
      ? "pending-extraction"
      : "pending-thumbnail";

  const pending = await prisma.extractionJob.update({
    where: { id: job.id },
    data: { status: nextStatus, completed: false, error: null },
    select: { status: true, completed: true, error: true },
  });

  triggerPosterExtractionWorker();

  return pending;
}
