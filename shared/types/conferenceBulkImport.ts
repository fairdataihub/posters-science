/** Multi-sheet metadata review workbook (see shared/bulkReviewWorkbookManifest.ts). */
export { BULK_IMPORT_METADATA_REVIEW_TEMPLATE_RELATIVE_PATH } from "#shared/bulkReviewWorkbookManifest";

export const BULK_IMPORT_LICENSES_SHEET_NAME = "Licenses";

/** Column headers on the Licenses sheet in bulk-submission-templates/license.xlsx */
export const BULK_IMPORT_LICENSE_SHEET_HEADERS = [
  "Poster Filename",
  "Poster License (SPDX id)",
] as const;

export type BulkImportSubmissionRowStatus =
  | "ready"
  | "missing_file"
  | "missing_license"
  | "invalid_license";

export type BulkImportSubmissionRow = {
  id: string;
  rowNumber: number;
  fileName: string;
  license: string;
  status: BulkImportSubmissionRowStatus;
  filePresent: boolean;
};

export type BulkImportBatchItemStatus =
  | "queued"
  | "uploading"
  | "waitingInQueue"
  | "extracting"
  | "completed"
  | "failed"
  /** The user stopped extraction before this poster was processed. */
  | "stopped";

export type BulkImportBatchItem = {
  id: string;
  fileName: string;
  status: BulkImportBatchItemStatus;
  filePath?: string;
  posterId?: number;
  extractionJobId?: string;
  error?: string;
};
