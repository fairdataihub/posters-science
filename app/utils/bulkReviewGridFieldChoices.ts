import identifierTypes from "@/assets/data/identifier-types.json";
import {
  FUNDER_IDENTIFIER_TYPE_OPTIONS,
  IDENTIFIER_TYPE_OPTIONS,
  ISO_LANGUAGE_OPTIONS,
  NAME_TYPE_OPTIONS,
  RELATION_TYPE_OPTIONS,
  RESOURCE_TYPE_OPTIONS,
} from "~/utils/poster_schema";

function optionValues(
  options: ReadonlyArray<{ value: string } | string>,
): string[] {
  return options.map((entry) =>
    typeof entry === "string" ? entry : entry.value,
  );
}

/** Dropdown values for grid cells keyed by workbook fillKey (matches share form enums). */
export const BULK_REVIEW_GRID_FIELD_CHOICES: Record<string, readonly string[]> =
  {
    name_type: optionValues(NAME_TYPE_OPTIONS),
    // Sorted by language name, since the dropdown shows names.
    language: optionValues(
      [...ISO_LANGUAGE_OPTIONS].sort((a, b) => a.label.localeCompare(b.label)),
    ),
    identifier_type: optionValues(IDENTIFIER_TYPE_OPTIONS),
    related_identifier_type: optionValues(IDENTIFIER_TYPE_OPTIONS),
    relation_type: optionValues(RELATION_TYPE_OPTIONS),
    resource_type_general: optionValues(RESOURCE_TYPE_OPTIONS),
    funder_identifier_type: [...FUNDER_IDENTIFIER_TYPE_OPTIONS],
    conference_identifier_type: identifierTypes.map((entry) => entry.value),
  };

/** Display text for stored values, where it differs (the stored value is unchanged). */
const BULK_REVIEW_GRID_CHOICE_LABELS: Record<string, ReadonlyMap<string, string>> =
  {
    language: new Map(
      ISO_LANGUAGE_OPTIONS.map((option) => [option.value, option.label]),
    ),
  };

/** Text to show for a dropdown value, e.g. "English" for language "en". */
export function bulkReviewGridChoiceLabel(fillKey: string, value: string): string {
  return BULK_REVIEW_GRID_CHOICE_LABELS[fillKey]?.get(value) ?? value;
}

export function bulkReviewGridChoicesForFillKey(
  fillKey: string,
): readonly string[] | undefined {
  return BULK_REVIEW_GRID_FIELD_CHOICES[fillKey];
}
