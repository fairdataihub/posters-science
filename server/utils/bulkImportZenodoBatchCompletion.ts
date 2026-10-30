import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { posterFamilyRootId } from "~~/server/utils/posterVersions";
import { findBulkSubmissionJobForPoster } from "~~/server/utils/bulkExtractionMetadataGate";
import { orderedBulkImportPosterEntries } from "~~/server/utils/bulkImportOrderedPosters";
import { postersScienceDiscoverUrl } from "~~/server/utils/postersScienceDiscoverRelatedIdentifier";
import prisma from "~~/server/utils/prisma";

function zenodoRecordUrlFromPoster(poster: {
  status: string;
  zenodoDepositions: {
    depositionId: number;
    status: string;
    lastPublishedZenodoDoi: string | null;
  } | null;
}): string | undefined {
  const deposition = poster.zenodoDepositions;
  if (!deposition) return undefined;

  const doi = deposition.lastPublishedZenodoDoi?.trim();
  if (doi) {
    if (/^https?:\/\//i.test(doi)) return doi;
    return `https://doi.org/${doi.replace(/^doi:\s*/i, "")}`;
  }

  if (
    (poster.status === "published" || deposition.status === "published") &&
    deposition.depositionId
  ) {
    return `https://zenodo.org/records/${deposition.depositionId}`;
  }

  return undefined;
}

/**
 * When every poster in the batch is published on Posters.science (after Zenodo),
 * mark the bulk import job complete.
 */
export async function tryMarkBulkSubmissionZenodoComplete(
  userId: string,
  posterId: number,
): Promise<{ markedComplete: boolean; jobId: string | null }> {
  const bulkJob = await findBulkSubmissionJobForPoster(userId, posterId);
  if (!bulkJob) {
    return { markedComplete: false, jobId: null };
  }

  const job = await prisma.bulkSubmission.findFirst({
    where: { id: bulkJob.id, userId },
    select: {
      id: true,
      status: true,
      submissionSummary: true,
    },
  });

  if (!job || job.status === "completed") {
    return { markedComplete: false, jobId: bulkJob.id };
  }

  const entries = orderedBulkImportPosterEntries(job.submissionSummary);
  if (entries.length === 0) {
    return { markedComplete: false, jobId: bulkJob.id };
  }

  const posterIds = entries.map((entry) => entry.posterId);
  const posters = await prisma.poster.findMany({
    where: { id: { in: posterIds }, userId },
    select: {
      id: true,
      status: true,
      zenodoDepositions: {
        select: {
          depositionId: true,
          status: true,
          lastPublishedZenodoDoi: true,
        },
      },
    },
  });

  if (posters.length !== posterIds.length) {
    return { markedComplete: false, jobId: bulkJob.id };
  }

  const allPublished = posterIds.every((id) => {
    const poster = posters.find((row) => row.id === id);
    return poster?.status === "published";
  });

  if (!allPublished) {
    return { markedComplete: false, jobId: bulkJob.id };
  }

  const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  const zenodoBatchCompletedAt = new Date().toISOString();

  await prisma.bulkSubmission.update({
    where: { id: job.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      wizardStep: "publish",
      submissionSummary: {
        ...summary,
        zenodoBatchCompletedAt,
      } as never,
    },
  });

  return { markedComplete: true, jobId: job.id };
}

export type BulkSubmissionCompletionPosterRow = {
  posterId: number;
  rootPosterId: number;
  title: string;
  fileName: string;
  doi: string | null;
  zenodoUrl: string | null;
  discoverUrl: string | null;
};

export async function buildBulkSubmissionCompletion(
  userId: string,
  jobId: string,
  siteEnv?: string | null,
): Promise<{
  jobId: string;
  name: string;
  completedAt: string | null;
  zenodoBatchCompletedAt: string | null;
  posters: BulkSubmissionCompletionPosterRow[];
  allPublishedOnPlatform: boolean;
} | null> {
  const job = await prisma.bulkSubmission.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      name: true,
      status: true,
      completedAt: true,
      submissionSummary: true,
    },
  });

  if (!job) return null;

  const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  const entries = orderedBulkImportPosterEntries(summary);
  const posterIds = entries.map((entry) => entry.posterId);

  const posters = await prisma.poster.findMany({
    where: { id: { in: posterIds }, userId },
    select: {
      id: true,
      title: true,
      status: true,
      versionRootId: true,
      posterMetadata: { select: { doi: true } },
      zenodoDepositions: {
        select: {
          depositionId: true,
          status: true,
          lastPublishedZenodoDoi: true,
        },
      },
    },
  });

  const byId = new Map(posters.map((poster) => [poster.id, poster]));

  const rows: BulkSubmissionCompletionPosterRow[] = entries.map((entry) => {
    const poster = byId.get(entry.posterId);
    const rootPosterId = poster
      ? posterFamilyRootId(poster)
      : entry.posterId;
    const title = poster?.title?.trim() || entry.fileName.replace(/\.[^.]+$/, "");
    const zenodoUrl = poster
      ? zenodoRecordUrlFromPoster(poster) ?? null
      : null;
    const discoverUrl =
      poster?.status === "published"
        ? postersScienceDiscoverUrl(rootPosterId, siteEnv)
        : null;
    const doi =
      poster?.posterMetadata?.doi?.trim() ||
      poster?.zenodoDepositions?.lastPublishedZenodoDoi?.trim() ||
      null;

    return {
      posterId: entry.posterId,
      rootPosterId,
      title,
      fileName: entry.fileName,
      doi,
      zenodoUrl,
      discoverUrl,
    };
  });

  const allPublishedOnPlatform = posterIds.every((id) => {
    const poster = byId.get(id);
    return poster?.status === "published";
  });

  return {
    jobId: job.id,
    name: job.name,
    completedAt: job.completedAt?.toISOString() ?? null,
    zenodoBatchCompletedAt: summary.zenodoBatchCompletedAt ?? null,
    posters: rows,
    allPublishedOnPlatform,
  };
}
