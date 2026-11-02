import {
  buildBulkSubmissionCompletion,
  tryCompleteBulkBatchIfReady,
} from "~~/server/utils/bulkImportZenodoBatchCompletion";
import { orderedBulkImportPosterEntries } from "~~/server/utils/bulkImportOrderedPosters";
import { isZenodoFileEmbargoActive } from "#shared/utils/zenodoFileEmbargoAccess";
import { resolvePosterZenodoFilesEmbargoUntil } from "~~/server/utils/posterZenodoFilesEmbargo";
import { liftZenodoFileEmbargoForPoster } from "~~/server/utils/zenodoFileEmbargoLift";
import prisma from "~~/server/utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const job = await prisma.bulkSubmission.findFirst({
    where: { id: jobId, userId: session.user.id },
    select: { id: true, submissionSummary: true },
  });

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  const entries = orderedBulkImportPosterEntries(job.submissionSummary);
  const posterIds = entries.map((entry) => entry.posterId);

  const posters = await prisma.poster.findMany({
    where: { id: { in: posterIds }, userId: session.user.id },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      zenodoDepositions: { select: { filesEmbargoUntil: true } },
    },
  });

  const failures: { posterId: number; error: string }[] = [];
  let released = 0;

  for (const posterId of posterIds) {
    const poster = posters.find((row) => row.id === posterId);
    if (!poster || poster.status !== "published") continue;

    const until = await resolvePosterZenodoFilesEmbargoUntil(
      poster,
      session.user.id,
    );
    if (!isZenodoFileEmbargoActive(until)) continue;

    const result = await liftZenodoFileEmbargoForPoster(
      session.user.id,
      posterId,
    );
    if (result.success) {
      released += 1;
    } else {
      failures.push({
        posterId,
        error: result.error ?? "Could not release files",
      });
    }
  }

  await tryCompleteBulkBatchIfReady(session.user.id, jobId);

  return {
    released,
    failed: failures.length,
    failures,
  };
});
