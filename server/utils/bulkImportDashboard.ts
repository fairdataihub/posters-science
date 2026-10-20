import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";

type BulkRowWithSummary = {
  status: string;
  submissionSummary: unknown;
};

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
