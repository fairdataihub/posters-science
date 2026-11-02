import { isZenodoFileEmbargoActive } from "#shared/utils/zenodoFileEmbargoAccess";
import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { posterFamilyRootId } from "~~/server/utils/posterVersions";
import { findBulkSubmissionJobForPoster } from "~~/server/utils/bulkExtractionMetadataGate";
import { orderedBulkImportPosterEntries } from "~~/server/utils/bulkImportOrderedPosters";
import { postersScienceDiscoverUrl } from "~~/server/utils/postersScienceDiscoverRelatedIdentifier";
import { resolvePosterZenodoFilesEmbargoUntil } from "~~/server/utils/posterZenodoFilesEmbargo";
import { zenodoRecordUrlForPoster } from "~~/server/utils/zenodoPosterRecordUrl";
import prisma from "~~/server/utils/prisma";

type BatchPosterEmbargoRow = {
  id: number;
  status: string;
  publishedAt: Date | null;
  zenodoDepositions: {
    depositionId: number | null;
    filesEmbargoUntil: string | null;
  } | null;
};

export async function resolveBulkBatchEmbargoStatus(
  userId: string,
  posters: BatchPosterEmbargoRow[],
): Promise<{
  hasActiveEmbargo: boolean;
  activeEmbargoCount: number;
  latestActiveEmbargoUntil: string | null;
}> {
  let activeEmbargoCount = 0;
  let latestActiveEmbargoUntil: string | null = null;

  for (const poster of posters) {
    const until = await resolvePosterZenodoFilesEmbargoUntil(poster, userId);
    if (!isZenodoFileEmbargoActive(until)) continue;

    activeEmbargoCount += 1;
    const normalized = until!.slice(0, 10);
    if (!latestActiveEmbargoUntil || normalized > latestActiveEmbargoUntil) {
      latestActiveEmbargoUntil = normalized;
    }
  }

  return {
    hasActiveEmbargo: activeEmbargoCount > 0,
    activeEmbargoCount,
    latestActiveEmbargoUntil,
  };
}

/**
 * True when every embargoed poster has a Zenodo record id and a stored
 * filesEmbargoUntil from publish (not a bulk-settings fallback).
 */
export async function bulkBatchFileEmbargoEarlyReleaseReady(
  userId: string,
  posters: BatchPosterEmbargoRow[],
): Promise<boolean> {
  let sawActiveEmbargo = false;

  for (const poster of posters) {
    const until = await resolvePosterZenodoFilesEmbargoUntil(poster, userId);
    if (!isZenodoFileEmbargoActive(until)) continue;

    sawActiveEmbargo = true;

    const stored = poster.zenodoDepositions?.filesEmbargoUntil?.trim();
    const recordId = poster.zenodoDepositions?.depositionId;
    if (!stored || !recordId) return false;
  }

  return sawActiveEmbargo;
}

async function loadBatchPostersForEmbargoCheck(
  userId: string,
  posterIds: number[],
) {
  return prisma.poster.findMany({
    where: { id: { in: posterIds }, userId },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      zenodoDepositions: {
        select: {
          depositionId: true,
          status: true,
          lastPublishedZenodoDoi: true,
          filesEmbargoUntil: true,
        },
      },
    },
  });
}

async function markBulkJobZenodoComplete(
  jobId: string,
  summary: BulkImportSubmissionSummary,
) {
  const zenodoBatchCompletedAt = new Date().toISOString();

  await prisma.bulkSubmission.update({
    where: { id: jobId },
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
}

/**
 * Marks a bulk job complete when every batch poster is published and no file
 * embargoes are still active.
 */
export async function tryCompleteBulkBatchIfReady(
  userId: string,
  jobId: string,
): Promise<{ markedComplete: boolean }> {
  const job = await prisma.bulkSubmission.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      status: true,
      submissionSummary: true,
    },
  });

  if (!job || job.status === "completed") {
    return { markedComplete: false };
  }

  const entries = orderedBulkImportPosterEntries(job.submissionSummary);
  if (entries.length === 0) {
    return { markedComplete: false };
  }

  const posterIds = entries.map((entry) => entry.posterId);
  const posters = await loadBatchPostersForEmbargoCheck(userId, posterIds);

  if (posters.length !== posterIds.length) {
    return { markedComplete: false };
  }

  const allPublished = posterIds.every((id) => {
    const poster = posters.find((row) => row.id === id);
    return poster?.status === "published";
  });

  if (!allPublished) {
    return { markedComplete: false };
  }

  const embargo = await resolveBulkBatchEmbargoStatus(userId, posters);
  if (embargo.hasActiveEmbargo) {
    return { markedComplete: false };
  }

  const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  await markBulkJobZenodoComplete(job.id, summary);

  return { markedComplete: true };
}

/**
 * When every poster in the batch is published on Posters.science (after Zenodo),
 * mark the bulk import job complete once file embargoes have ended.
 */
export async function tryMarkBulkSubmissionZenodoComplete(
  userId: string,
  posterId: number,
): Promise<{ markedComplete: boolean; jobId: string | null }> {
  const bulkJob = await findBulkSubmissionJobForPoster(userId, posterId);
  if (!bulkJob) {
    return { markedComplete: false, jobId: null };
  }

  const result = await tryCompleteBulkBatchIfReady(userId, bulkJob.id);
  return { markedComplete: result.markedComplete, jobId: bulkJob.id };
}

export type BulkSubmissionCompletionPosterRow = {
  posterId: number;
  rootPosterId: number;
  title: string;
  fileName: string;
  doi: string | null;
  zenodoUrl: string | null;
  discoverUrl: string | null;
  filesEmbargoUntil: string | null;
  filesEmbargoActive: boolean;
};

export async function buildBulkSubmissionCompletion(
  userId: string,
  jobId: string,
  siteEnv?: string | null,
  zenodoWebBase?: string | null,
): Promise<{
  jobId: string;
  name: string;
  completedAt: string | null;
  zenodoBatchCompletedAt: string | null;
  posters: BulkSubmissionCompletionPosterRow[];
  allPublishedOnPlatform: boolean;
  awaitingEmbargoRelease: boolean;
  activeEmbargoCount: number;
  latestActiveEmbargoUntil: string | null;
  /** When false, hide in-app early release until Zenodo publish stored embargo metadata. */
  fileEmbargoEarlyReleaseReady: boolean;
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

  const zenodoBase = zenodoWebBase?.trim() || "https://zenodo.org";

  const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  const entries = orderedBulkImportPosterEntries(summary);
  const posterIds = entries.map((entry) => entry.posterId);

  const posters = await prisma.poster.findMany({
    where: { id: { in: posterIds }, userId },
    select: {
      id: true,
      title: true,
      status: true,
      publishedAt: true,
      versionRootId: true,
      posterMetadata: { select: { doi: true } },
      zenodoDepositions: {
        select: {
          depositionId: true,
          status: true,
          lastPublishedZenodoDoi: true,
          filesEmbargoUntil: true,
        },
      },
    },
  });

  const byId = new Map(posters.map((poster) => [poster.id, poster]));

  const embargoStatus = await resolveBulkBatchEmbargoStatus(userId, posters);
  const fileEmbargoEarlyReleaseReady =
    await bulkBatchFileEmbargoEarlyReleaseReady(userId, posters);

  const rows: BulkSubmissionCompletionPosterRow[] = await Promise.all(
    entries.map(async (entry) => {
      const poster = byId.get(entry.posterId);
      const rootPosterId = poster
        ? posterFamilyRootId(poster)
        : entry.posterId;
      const title =
        poster?.title?.trim() || entry.fileName.replace(/\.[^.]+$/, "");
      const zenodoUrl = poster
        ? (zenodoRecordUrlForPoster(poster, zenodoBase) ?? null)
        : null;
      const discoverUrl =
        poster?.status === "published"
          ? postersScienceDiscoverUrl(rootPosterId, siteEnv)
          : null;
      const doi =
        poster?.posterMetadata?.doi?.trim() ||
        poster?.zenodoDepositions?.lastPublishedZenodoDoi?.trim() ||
        null;

      const filesEmbargoUntil = poster
        ? await resolvePosterZenodoFilesEmbargoUntil(poster, userId)
        : null;

      return {
        posterId: entry.posterId,
        rootPosterId,
        title,
        fileName: entry.fileName,
        doi,
        zenodoUrl,
        discoverUrl,
        filesEmbargoUntil,
        filesEmbargoActive: isZenodoFileEmbargoActive(filesEmbargoUntil),
      };
    }),
  );

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
    awaitingEmbargoRelease:
      allPublishedOnPlatform && embargoStatus.hasActiveEmbargo,
    activeEmbargoCount: embargoStatus.activeEmbargoCount,
    latestActiveEmbargoUntil: embargoStatus.latestActiveEmbargoUntil,
    fileEmbargoEarlyReleaseReady,
  };
}
