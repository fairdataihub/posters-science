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
    label: "Minimal",
    accuracyNote: "95% accuracy threshold",
    description:
      "Fill in poster details only when extraction meets a 95% accuracy threshold. Spreadsheet values you provide are never overwritten.",
  },
  {
    value: "full",
    label: "Full",
    accuracyNote: "75% accuracy threshold",
    description:
      "Extract poster details from each file. Fields below a 75% accuracy threshold are flagged for review.",
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
