import {
  BULK_IMPORT_WIZARD_STEPS,
  type BulkImportWizardStep,
} from "#shared/types/bulkImportWizard";

/** @deprecated Use BulkImportWizardStep */
export type ConferenceBulkImportWizardStep = BulkImportWizardStep;

/** Base file name (no extension) for per-poster license workbook in bulk import. */
export const CONFERENCE_BULK_IMPORT_LICENSE_FILE_BASENAME = "license";

/** @deprecated Use CONFERENCE_BULK_IMPORT_LICENSE_FILE_BASENAME */
export const CONFERENCE_BULK_IMPORT_LICENSE_CSV_BASENAME =
  CONFERENCE_BULK_IMPORT_LICENSE_FILE_BASENAME;

/** @deprecated Use CONFERENCE_BULK_IMPORT_LICENSE_FILE_BASENAME */
export const CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME =
  CONFERENCE_BULK_IMPORT_LICENSE_FILE_BASENAME;

export const BULK_IMPORT_LICENSE_TEMPLATE_RELATIVE_PATH =
  "public/bulk-submission-templates/license.xlsx";

/** Multi-sheet metadata review workbook (see shared/bulkReviewWorkbookManifest.ts). */
export { BULK_IMPORT_METADATA_REVIEW_TEMPLATE_RELATIVE_PATH } from "#shared/bulkReviewWorkbookManifest";

export const BULK_IMPORT_LICENSES_SHEET_NAME = "Licenses";

/** Column headers on the Licenses sheet in bulk-submission-templates/license.xlsx */
export const BULK_IMPORT_LICENSE_SHEET_HEADERS = [
  "Poster Filename",
  "Poster License (SPDX id)",
] as const;

/** @deprecated Use BULK_IMPORT_LICENSE_SHEET_HEADERS */
export const BULK_IMPORT_LICENSE_CSV_HEADERS = BULK_IMPORT_LICENSE_SHEET_HEADERS;

/** @deprecated Use BULK_IMPORT_WIZARD_STEPS */
export const CONFERENCE_BULK_IMPORT_WIZARD_STEPS = BULK_IMPORT_WIZARD_STEPS;

export type BulkImportSubmissionRowStatus =
  | "ready"
  | "missing_file"
  | "missing_license"
  | "invalid_license"
  | "pending_unpack";

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
  | "failed";

export type BulkImportBatchItem = {
  id: string;
  fileName: string;
  status: BulkImportBatchItemStatus;
  filePath?: string;
  posterId?: number;
  extractionJobId?: string;
  error?: string;
};
