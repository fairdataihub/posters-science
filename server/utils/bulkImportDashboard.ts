import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { resolveBulkBatchEmbargoStatus } from "~~/server/utils/bulkImportZenodoBatchCompletion";
import prisma from "~~/server/utils/prisma";

type BulkRowWithSummary = {
  status: string;
  submissionSummary: unknown;
};

const BULK_STATUSES_HIDE_POSTER_CARDS = new Set([
  "draft",
  "processing",
  "failed",
]);

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

/**
 * Poster IDs created by bulk submit that should not appear as separate
 * dashboard cards while the batch is still in progress (draft through publish).
 */
export function posterIdsHiddenByBulkImport(
  bulkRows: BulkRowWithSummary[],
): Set<number> {
  const hidden = new Set<number>();

  for (const bulk of bulkRows) {
    if (!BULK_STATUSES_HIDE_POSTER_CARDS.has(bulk.status)) continue;

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
        zenodoDepositions: { select: { filesEmbargoUntil: true } },
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
  const hidden = posterIdsHiddenByBulkImport(inProgressBulkRows);
  const embargoHidden = await posterIdsHiddenByCompletedBulkEmbargo(
    userId,
    completedBulkRows,
  );

  for (const id of embargoHidden) {
    hidden.add(id);
  }

  return hidden;
}
