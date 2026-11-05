import prisma from "~~/server/utils/prisma";
import { posterIdsFromBulkSubmissionSummary } from "~~/server/utils/bulkImportDashboard";

/** The user's bulk submission that created this poster, if any. */
export async function findBulkSubmissionJobForPoster(
  userId: string,
  posterId: number,
): Promise<{ id: string } | null> {
  const jobs = await prisma.bulkSubmission.findMany({
    where: {
      userId,
      status: { in: ["draft", "processing", "completed", "failed"] },
    },
    select: {
      id: true,
      submissionSummary: true,
    },
    orderBy: { updated: "desc" },
  });

  for (const job of jobs) {
    const posterIds = posterIdsFromBulkSubmissionSummary(job.submissionSummary);
    if (posterIds.includes(posterId)) {
      return { id: job.id };
    }
  }

  return null;
}
