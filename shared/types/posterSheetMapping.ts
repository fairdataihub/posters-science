/**
 * Result of mapping an organizer's poster spreadsheet (Curious, EasyChair, our
 * own) onto the bulk metadata grid. Produced by the extraction API's
 * POST /sheets/map; see docs/SHEET_MAPPING.md in posters-science-extraction-api.
 */

export type PosterSheetWarningSeverity = "error" | "warning" | "info";

export type PosterSheetWarning = {
  code: string;
  message: string;
  severity: PosterSheetWarningSeverity;
};

export type PosterSheetColumnSource =
  | "template"
  | "alias"
  | "fuzzy"
  | "llm"
  | "values"
  | "user"
  | "duplicate"
  | "none";

export type PosterSheetColumnMapping = {
  column: string;
  /** One of `fields`, or null when the column is not used */
  field: string | null;
  source: PosterSheetColumnSource;
  /** False for fields the poster record has no place for (contact email, social links) */
  stored: boolean;
  samples: string[];
};

/** Grid rows keyed by fillKey; `file_name` links each row to an uploaded poster. */
export type PosterSheetRow = Record<string, string> & { file_name: string };

export type PosterSheetMappingResult = {
  template: {
    id: string | null;
    name: string | null;
    /** A saved template matched and nothing was guessed */
    known: boolean;
    fingerprint: string;
  };
  sheet_name: string;
  header_row: number;
  mapping: PosterSheetColumnMapping[];
  file_column: { column: string; matched_rows: number; rows: number } | null;
  /** Sheet name -> rows, using the metadata grid's sheet names and fillKeys */
  sheets: Record<string, PosterSheetRow[]>;
  unmatched_rows: { row: number; value: string; title: string }[];
  unmatched_files: string[];
  warnings: PosterSheetWarning[];
  needs_confirmation: boolean;
  ok: boolean;
  /** Field name -> plain description, for the column dropdowns */
  fields: Record<string, string>;
};

/** What the wizard keeps after the user confirms a sheet. */
export type PendingPosterSheet = {
  sheetFileName: string;
  confirmedAt: string;
  template: PosterSheetMappingResult["template"];
  sheets: Record<string, PosterSheetRow[]>;
};
