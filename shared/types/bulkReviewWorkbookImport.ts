import type { BulkImportValidationIssue } from "#shared/types/bulkImportValidation";

export type BulkReviewWorkbookImportResult = {
  updatedPosterIds: number[];
  issues: BulkImportValidationIssue[];
};
