import {
  normalizeBulkSubmissionExtractionMethod,
  type BulkSubmissionExtractionMethod,
} from "#shared/types/bulkSubmission";

export type BulkExtractionLevelOption = {
  value: BulkSubmissionExtractionMethod;
  label: string;
  description: string;
  /** Shown in the poster-details step (e.g. accuracy threshold). */
  accuracyNote: string;
  badge?: string;
  disabled?: boolean;
};

/** Wizard copy for bulk extraction levels (pipeline behavior is enforced server-side later). */
export const BULK_EXTRACTION_LEVEL_OPTIONS: BulkExtractionLevelOption[] = [
  {
    value: "minimal",
    label: "High confidence only",
    accuracyNote: "95% confidence threshold",
    description:
      "Pre-fill only fields the model is very sure about. You can add more on the supplementary metadata step using the batch workbook.",
  },
  {
    value: "full",
    label: "Extract everything we can",
    accuracyNote: "75% confidence threshold",
    badge: "Recommended",
    description:
      "Pre-fill as much metadata as possible from each PDF. This is the most automated option. Lower-confidence fields are included and should be reviewed before publish.",
  },
];

/** User-facing label for dashboard / summaries; null if method is missing or unknown. */
export function bulkExtractionLevelLabel(
  method: string | null | undefined,
): string | null {
  if (!method?.trim()) return null;

  const value = normalizeBulkSubmissionExtractionMethod(method);
  return (
    BULK_EXTRACTION_LEVEL_OPTIONS.find((option) => option.value === value)
      ?.label ?? null
  );
}
