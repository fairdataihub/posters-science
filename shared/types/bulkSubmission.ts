/** How a bulk batch will be processed when submitted to the extraction pipeline. */
export const BULK_SUBMISSION_EXTRACTION_METHODS = [
  "automated",
  "manual",
] as const;

export type BulkSubmissionExtractionMethod =
  (typeof BULK_SUBMISSION_EXTRACTION_METHODS)[number];

export const DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD: BulkSubmissionExtractionMethod =
  "automated";
