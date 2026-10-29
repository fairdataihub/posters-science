import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { posterIdsFromBulkSubmissionSummary } from "~~/server/utils/bulkImportDashboard";

export type BulkImportOrderedPosterEntry = {
  posterId: number;
  fileName: string;
};

export function orderedBulkImportPosterEntries(
  summary: unknown,
): BulkImportOrderedPosterEntry[] {
  const typed = summary as BulkImportSubmissionSummary | null | undefined;
  if (typed?.createdPosters?.length) {
    return typed.createdPosters
      .filter((entry) => typeof entry.posterId === "number")
      .map((entry) => ({
        posterId: entry.posterId,
        fileName: entry.fileName?.trim() || `poster-${entry.posterId}.pdf`,
      }));
  }

  return posterIdsFromBulkSubmissionSummary(summary).map((posterId) => ({
    posterId,
    fileName: `poster-${posterId}.pdf`,
  }));
}
