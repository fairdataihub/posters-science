import {
  normalizeBulkSubmissionExtractionMethod,
  type BulkSubmissionExtractionMethod,
} from "#shared/types/bulkSubmission";

export type BulkExtractionLevelOption = {
  value: BulkSubmissionExtractionMethod;
  label: string;
  description: string;
  /** Short badge in the wizard (e.g. recommended). */
  badge?: string;
};

/** Wizard copy for bulk extraction levels (pipeline behavior is enforced server-side later). */
export const BULK_EXTRACTION_LEVEL_OPTIONS: BulkExtractionLevelOption[] = [
  {
    value: "full_fair",
    label: "Read from each poster file",
    badge: "Recommended",
    description:
      "We pull title, authors, abstract, and more from the posters. You’ll review anything we’re unsure about before publishing.",
  },
  {
    value: "minimal",
    label: "Use my spreadsheet",
    description:
      "Your CSV is the source of truth. We only fill empty cells from the poster when we’re very confident, and we won’t change what you entered.",
  },
  {
    value: "full_acknowledged",
    label: "Read from posters (less review)",
    description:
      "Same as above, but you allow us to keep some fields without a manual check when confidence is lower. You can still edit everything before publish.",
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
