import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { normalizeBulkImportReviewEmbargoDays } from "#shared/types/bulkImportReviewEmbargo";
import { findBulkSubmissionJobForPoster } from "~~/server/utils/bulkSubmissionForPoster";
import prisma from "~~/server/utils/prisma";

/**
 * When a poster belongs to a bulk import batch with review embargo enabled,
 * returns the configured embargo length in days for Zenodo file access.
 */
export async function bulkZenodoFileEmbargoDaysForPoster(
  userId: string,
  posterId: number,
): Promise<number | null> {
  const bulkJob = await findBulkSubmissionJobForPoster(userId, posterId);
  if (!bulkJob) return null;

  const job = await prisma.bulkSubmission.findFirst({
    where: { id: bulkJob.id, userId },
    select: { submissionSummary: true },
  });

  const summary = (job?.submissionSummary ??
    {}) as BulkImportSubmissionSummary;

  if (!summary.reviewEmbargoEnabled) return null;

  return normalizeBulkImportReviewEmbargoDays(summary.reviewEmbargoDays);
}
