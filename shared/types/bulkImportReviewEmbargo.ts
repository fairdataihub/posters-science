export type BulkImportReviewEmbargoChoice = "yes" | "no";

export const MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS = 1;
export const MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS = 30;
export const DEFAULT_BULK_IMPORT_REVIEW_EMBARGO_DAYS = 30;

export function normalizeBulkImportReviewEmbargoDays(
  value: unknown,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_BULK_IMPORT_REVIEW_EMBARGO_DAYS;
  }

  return Math.min(
    MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS,
    Math.max(MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS, Math.trunc(parsed)),
  );
}

export function isBulkImportReviewEmbargoDaysValid(value: unknown): boolean {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return false;
  }

  return (
    parsed >= MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS &&
    parsed <= MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS
  );
}
