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
    where: {
      id: jobId,
      status: "failed",
      poster: { userId, status: { not: "published" } },
    },
    select: { id: true },
  });

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Failed extraction job not found",
    });
  }

  const pending = await prisma.extractionJob.update({
    where: { id: job.id },
    data: {
      status: "pending-extraction",
      completed: false,
      error: null,
    },
    select: { status: true, completed: true, error: true },
  });

  triggerPosterExtractionWorker();

  return pending;
}
