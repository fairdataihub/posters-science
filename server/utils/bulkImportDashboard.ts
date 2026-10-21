import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
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

/**
 * Poster IDs created by bulk submit that should not appear as separate
 * dashboard cards while the batch is still in progress.
 */
export function posterIdsHiddenByBulkImport(
  bulkRows: BulkRowWithSummary[],
): Set<number> {
  const hidden = new Set<number>();

  for (const bulk of bulkRows) {
    if (bulk.status !== "processing") continue;

    const summary = bulk.submissionSummary as BulkImportSubmissionSummary | null;
    if (!summary) continue;

    if (Array.isArray(summary.createdPosterIds)) {
      for (const id of summary.createdPosterIds) {
        if (typeof id === "number") hidden.add(id);
      }
    }

    if (Array.isArray(summary.createdPosters)) {
      for (const entry of summary.createdPosters) {
        if (entry && typeof entry.posterId === "number") {
          hidden.add(entry.posterId);
        }
      }
    }
  }

  return hidden;
}
