/** Wizard steps for conference bulk poster import (UI + future server job). */
export type ConferenceBulkImportWizardStep = "assets" | "review" | "submit";

/** Base file name (no extension) for per-poster SPDX metadata in bulk import ZIPs. */
export const CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME =
  "license_metadata";

export const CONFERENCE_BULK_IMPORT_WIZARD_STEPS: {
  id: ConferenceBulkImportWizardStep;
  label: string;
  description: string;
}[] = [
  {
    id: "assets",
    label: "Posters & licenses",
    description: "Upload files and license metadata",
  },
  {
    id: "review",
    label: "Review",
    description: "Check file names and licenses",
  },
  {
    id: "submit",
    label: "Import",
    description: "Submit bulk import to Posters.science",
  },
];

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
