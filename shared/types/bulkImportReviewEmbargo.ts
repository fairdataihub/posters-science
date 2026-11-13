import * as z from "zod";

export type BulkImportReviewEmbargoChoice = "yes" | "no";

export const MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS = 1;
export const MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS = 30;
export const DEFAULT_BULK_IMPORT_REVIEW_EMBARGO_DAYS = 30;

const EMBARGO_DAYS_RANGE_MESSAGE = `Embargo length must be ${MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS}–${MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS} days`;

/** Embargo length rules for the publish step. */
export const bulkImportReviewEmbargoDaysSchema = z
  .number({ error: "Embargo length is required" })
  .int({ error: "Embargo length must be a whole number of days" })
  .min(MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS, {
    error: EMBARGO_DAYS_RANGE_MESSAGE,
  })
  .max(MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS, {
    error: EMBARGO_DAYS_RANGE_MESSAGE,
  });

export function normalizeBulkImportReviewEmbargoDays(value: unknown): number {
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
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;

  return bulkImportReviewEmbargoDaysSchema.safeParse(parsed).success;
}
