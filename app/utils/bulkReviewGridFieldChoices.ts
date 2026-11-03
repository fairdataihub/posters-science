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
    language: optionValues(ISO_LANGUAGE_OPTIONS),
    identifier_type: optionValues(IDENTIFIER_TYPE_OPTIONS),
    related_identifier_type: optionValues(IDENTIFIER_TYPE_OPTIONS),
    relation_type: optionValues(RELATION_TYPE_OPTIONS),
    resource_type_general: optionValues(RESOURCE_TYPE_OPTIONS),
    funder_identifier_type: [...FUNDER_IDENTIFIER_TYPE_OPTIONS],
    conference_identifier_type: identifierTypes.map((entry) => entry.value),
  };

export function bulkReviewGridChoicesForFillKey(
  fillKey: string,
): readonly string[] | undefined {
  return BULK_REVIEW_GRID_FIELD_CHOICES[fillKey];
}
