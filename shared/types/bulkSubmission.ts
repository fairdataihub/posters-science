/** How a bulk batch is processed when submitted to the extraction pipeline. */
export const BULK_SUBMISSION_EXTRACTION_METHODS = ["minimal", "full"] as const;

export type BulkSubmissionExtractionMethod =
  (typeof BULK_SUBMISSION_EXTRACTION_METHODS)[number];

export const DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD: BulkSubmissionExtractionMethod =
  "full";

const LEGACY_EXTRACTION_METHOD_MAP: Record<
  string,
  BulkSubmissionExtractionMethod
> = {
  automated: "full",
  manual: "minimal",
  metadata: "minimal",
  assisted: "minimal",
  minimal: "minimal",
  full_fair: "full",
  full_acknowledged: "full",
};

export function normalizeBulkSubmissionExtractionMethod(
  value: string | null | undefined,
): BulkSubmissionExtractionMethod {
  if (!value) return DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD;

  if (
    BULK_SUBMISSION_EXTRACTION_METHODS.includes(
      value as BulkSubmissionExtractionMethod,
    )
  ) {
    return value as BulkSubmissionExtractionMethod;
  }

  return (
    LEGACY_EXTRACTION_METHOD_MAP[value] ??
    DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD
  );
}

export function isBulkSubmissionExtractionMethod(
  value: string,
): value is BulkSubmissionExtractionMethod {
  return BULK_SUBMISSION_EXTRACTION_METHODS.includes(
    value as BulkSubmissionExtractionMethod,
  );
}
