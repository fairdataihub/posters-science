export type BulkImportUniformLicenseOption = {
  value: string;
  label: string;
  description: string;
};

export { BULK_IMPORT_ACCEPTABLE_LICENSES } from "#shared/data/bulkImportAcceptableLicenses";

import type { BulkImportConferenceMetadata } from "#shared/types/bulkImportConference";

export type BulkImportSubmissionSummary = {
  uniformLicense?: string;
  licenseSpreadsheetRows?: unknown[];
  conference?: BulkImportConferenceMetadata;
  /** When true, run automated ORCID and ROR lookups where possible. */
  automateOrcidRorLookups?: boolean;
  /** When true, posters stay in an on-site review spreadsheet before Zenodo. */
  reviewEmbargoEnabled?: boolean;
  /** Days for on-site review when `reviewEmbargoEnabled` is true (1–30). */
  reviewEmbargoDays?: number;
  /** ISO timestamp when every batch poster finished Zenodo / platform publish. */
  zenodoBatchCompletedAt?: string;
  /** Set when the batch is submitted to the extraction pipeline. */
  submittedAt?: string;
  createdPosterIds?: number[];
  createdPosters?: {
    posterId: number;
    extractionJobId: string;
    fileName: string;
    filePath?: string;
  }[];
};
