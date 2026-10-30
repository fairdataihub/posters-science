import { orderedBulkImportPosterEntries } from "~~/server/utils/bulkImportOrderedPosters";
import { buildBulkReviewWorkbookBuffer } from "~~/server/utils/bulkReviewWorkbookFill";
import { applyBulkSubmissionMetadataToPosters } from "~~/server/utils/bulkImportPosterMetadata";
import { ensurePostersScienceDiscoverRelatedIdentifier } from "~~/server/utils/postersScienceDiscoverRelatedIdentifier";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { normalizeBulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";

const INVALID_FILENAME_CHARS = /[^a-zA-Z0-9._-]+/g;

function safeWorkbookFilename(jobName: string, jobId: string) {
  const fromName = jobName
    .replace(INVALID_FILENAME_CHARS, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const base = fromName || `bulk-import-${jobId.slice(0, 8)}`;
  return `${base}-poster-metadata.xlsx`;
}

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, session.user.id);

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

  try {
    await applyBulkSubmissionMetadataToPosters(session.user.id, jobId);
  } catch {
    // Workbook still uses batch conference from summary when apply is not ready.
  }

  const posterIds = ordered.map((entry) => entry.posterId);

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

  const posters = await prisma.poster.findMany({
    where: {
      id: { in: posterIds },
      userId: session.user.id,
    },
    include: {
      posterMetadata: true,
      extractionJob: { select: { fileName: true } },
    },
  });

  const posterById = new Map(posters.map((poster) => [poster.id, poster]));
  const orderedPosters = ordered
    .map((entry) => posterById.get(entry.posterId))
    .filter((poster): poster is NonNullable<typeof poster> => poster != null);

  if (orderedPosters.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "No poster records found for this bulk import.",
    });
  }

  const extractionMethod = normalizeBulkSubmissionExtractionMethod(
    job.extractionMethod,
  );

  const buffer = await buildBulkReviewWorkbookBuffer(
    orderedPosters,
    extractionMethod,
    batchConference,
  );
  const filename = safeWorkbookFilename(job.name, job.id);

  setHeader(
    event,
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );

  return buffer;
});
