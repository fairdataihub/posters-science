import {
  BULK_IMPORT_WIZARD_STEPS,
  type BulkImportWizardStep,
} from "#shared/types/bulkImportWizard";

/** @deprecated Use BulkImportWizardStep */
export type ConferenceBulkImportWizardStep = BulkImportWizardStep;

/** Base file name (no extension) for per-poster SPDX metadata in bulk import ZIPs. */
export const CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME =
  "license_metadata";

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
  | "extracting"
  | "completed"
  | "failed";

export type BulkImportBatchItem = {
  id: string;
  fileName: string;
  status: BulkImportBatchItemStatus;
  error?: string;
};
