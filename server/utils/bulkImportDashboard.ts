import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { resolveBulkBatchEmbargoStatus } from "~~/server/utils/bulkImportZenodoBatchCompletion";
import prisma from "~~/server/utils/prisma";

type BulkRowWithSummary = {
  status: string;
  submissionSummary: unknown;
};

const ACTIVE_EXTRACTION_JOB_STATUSES = [
  "pending-extraction",
  "pending-thumbnail",
  "processing",
] as const;

export function posterIdsFromBulkSubmissionSummary(summary: unknown): number[] {
  const typed = summary as BulkImportSubmissionSummary | null | undefined;
  if (!typed) return [];

  const ids = new Set<number>();

  if (Array.isArray(typed.createdPosterIds)) {
    for (const id of typed.createdPosterIds) {
      if (typeof id === "number") ids.add(id);
    }
  }

  if (Array.isArray(typed.createdPosters)) {
    for (const entry of typed.createdPosters) {
      if (entry && typeof entry.posterId === "number") {
        ids.add(entry.posterId);
      }
    }
  }

  return [...ids];
}

export async function posterIdsWithActiveExtractionJob(
  posterIds: number[],
): Promise<Set<number>> {
  if (posterIds.length === 0) return new Set();

  const rows = await prisma.extractionJob.findMany({
    where: {
      posterId: { in: posterIds },
      completed: false,
      status: { in: [...ACTIVE_EXTRACTION_JOB_STATUSES] },
    },
    select: { posterId: true },
  });

  return new Set(rows.map((row) => row.posterId));
}

export function bulkSubmissionHasActiveExtraction(
  summary: unknown,
  activePosterIds: Set<number>,
): boolean {
  return posterIdsFromBulkSubmissionSummary(summary).some((posterId) =>
    activePosterIds.has(posterId),
  );
}

function bulkBatchAllPostersPublished(
  posterIds: number[],
  statusByPosterId: Map<number, string>,
): boolean {
  if (posterIds.length === 0) return false;
  return posterIds.every((id) => statusByPosterId.get(id) === "published");
}

/**
 * Splits bulk jobs for the dashboard. A batch stays "in progress" until every
 * poster in the batch is published on Zenodo, even if the job row is marked
 * completed or posters were marked downloaded after a local ZIP export.
 */
export async function splitBulkSubmissionsForDashboard<
  T extends BulkRowWithSummary,
>(userId: string, rows: T[]): Promise<{ inProgress: T[]; completed: T[] }> {
  const allPosterIds = new Set<number>();
  for (const bulk of rows) {
    for (const id of posterIdsFromBulkSubmissionSummary(bulk.submissionSummary)) {
      allPosterIds.add(id);
    }
  }

  const statusByPosterId = new Map<number, string>();
  if (allPosterIds.size > 0) {
    const posters = await prisma.poster.findMany({
      where: { userId, id: { in: [...allPosterIds] } },
      select: { id: true, status: true },
    });
    for (const poster of posters) {
      statusByPosterId.set(poster.id, poster.status);
    }
  }

  const inProgress: T[] = [];
  const completed: T[] = [];

  for (const bulk of rows) {
    const posterIds = posterIdsFromBulkSubmissionSummary(bulk.submissionSummary);
    const zenodoComplete =
      bulk.status === "completed" &&
      bulkBatchAllPostersPublished(posterIds, statusByPosterId);

    if (zenodoComplete) {
      completed.push(bulk);
    } else {
      inProgress.push(bulk);
    }
  }

  return { inProgress, completed };
}

/** Reset local-download status so batch posters stay drafts until Zenodo publish. */
export async function repairDownloadedPostersInActiveBulkBatches(
  userId: string,
  inProgressBulkRows: BulkRowWithSummary[],
): Promise<void> {
  const posterIds = new Set<number>();
  for (const bulk of inProgressBulkRows) {
    for (const id of posterIdsFromBulkSubmissionSummary(bulk.submissionSummary)) {
      posterIds.add(id);
    }
  }

  if (posterIds.size === 0) return;

  await prisma.poster.updateMany({
    where: {
      userId,
      id: { in: [...posterIds] },
      status: "downloaded",
    },
    data: { status: "draft" },
  });
}

/**
 * True when this poster belongs to a bulk batch that has not finished Zenodo
 * publication for every member poster.
 */
export async function posterManagedByUnfinishedBulkBatch(
  userId: string,
  posterId: number,
): Promise<boolean> {
  const jobs = await prisma.bulkSubmission.findMany({
    where: { userId },
    select: { submissionSummary: true, status: true },
    orderBy: { updated: "desc" },
  });

  for (const job of jobs) {
    const posterIds = posterIdsFromBulkSubmissionSummary(job.submissionSummary);
    if (!posterIds.includes(posterId)) continue;

    if (job.status !== "completed") return true;

    const posters = await prisma.poster.findMany({
      where: { userId, id: { in: posterIds } },
      select: { id: true, status: true },
    });
    const statusByPosterId = new Map(posters.map((row) => [row.id, row.status]));
    if (!bulkBatchAllPostersPublished(posterIds, statusByPosterId)) {
      return true;
    }
  }

  return false;
}

/**
 * Poster IDs that should not appear as separate dashboard cards while their
 * bulk batch is still in progress (through local download and until Zenodo).
 */
export function posterIdsHiddenByInProgressBulkBatches(
  inProgressBulkRows: BulkRowWithSummary[],
): Set<number> {
  const hidden = new Set<number>();

  for (const bulk of inProgressBulkRows) {
    for (const id of posterIdsFromBulkSubmissionSummary(bulk.submissionSummary)) {
      hidden.add(id);
    }
  }

  return hidden;
}

/**
 * Poster IDs from a bulk batch marked completed while Zenodo file embargoes
 * are still active. Those posters stay tied to the batch card, not as
 * individual in-progress rows (legacy jobs completed before embargo-aware flow).
 */
export async function posterIdsHiddenByCompletedBulkEmbargo(
  userId: string,
  completedBulkRows: BulkRowWithSummary[],
): Promise<Set<number>> {
  const hidden = new Set<number>();

  for (const bulk of completedBulkRows) {
    if (bulk.status !== "completed") continue;

    const posterIds = posterIdsFromBulkSubmissionSummary(bulk.submissionSummary);
    if (posterIds.length === 0) continue;

    const posters = await prisma.poster.findMany({
      where: { id: { in: posterIds }, userId },
      select: {
        id: true,
        status: true,
        publishedAt: true,
        zenodoDepositions: {
          select: { depositionId: true, filesEmbargoUntil: true },
        },
      },
    });

    if (posters.length === 0) continue;

    const embargo = await resolveBulkBatchEmbargoStatus(userId, posters);
    if (!embargo.hasActiveEmbargo) continue;

    for (const id of posterIds) {
      hidden.add(id);
    }
  }

  return hidden;
}

/** Union of bulk-hide rules for the dashboard in-progress feed. */
export async function posterIdsHiddenFromBulkDashboard(
  userId: string,
  inProgressBulkRows: BulkRowWithSummary[],
  completedBulkRows: BulkRowWithSummary[],
): Promise<Set<number>> {
  const hidden = posterIdsHiddenByInProgressBulkBatches(inProgressBulkRows);
  const embargoHidden = await posterIdsHiddenByCompletedBulkEmbargo(
    userId,
    completedBulkRows,
  );

  for (const id of embargoHidden) {
    hidden.add(id);
  }

  return hidden;
}
