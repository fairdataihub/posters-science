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

/**
 * Grid rows keyed by fillKey. `file_name` links the row to an uploaded poster;
 * it is empty until a row without a file name is matched by title.
 * `row_key` names the row in the organizer's sheet.
 */
export type PosterSheetRow = Record<string, string> & {
  file_name: string;
  row_key: string;
};

/** A sheet row with no file yet, matched by title once posters extract. */
export type PosterSheetMatchRow = {
  row_key: string;
  row: number;
  title: string;
  authors: string[];
  number: string;
};

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
  /** Per-author table joined to the rows (EasyChair Authors sheet), if any */
  authors_table: string | null;
  mapping: PosterSheetColumnMapping[];
  /** How rows link to files: a file name column, or a number in the file names */
  file_column: {
    column: string;
    method: "column" | "number";
    matched_rows: number;
    rows: number;
  } | null;
  /** Sheet name -> rows, using the metadata grid's sheet names and fillKeys */
  sheets: Record<string, PosterSheetRow[]>;
  unmatched_rows: { row: number; value: string; title: string }[];
  unmatched_files: string[];
  /** Rows with no file yet, to match by title after extraction */
  match_rows: PosterSheetMatchRow[];
  /** Per row notes, e.g. the project license from EasyChair form fields */
  hints: Record<string, { project_license?: string }>;
  /** Rows left out because they are not accepted posters */
  skipped: { deleted: number; not_accepted: number; talk_only: number };
  warnings: PosterSheetWarning[];
  needs_confirmation: boolean;
  ok: boolean;
  /** Field name -> plain description, for the column dropdowns */
  fields: Record<string, string>;
};

/** One row matched to a poster by POST /sheets/match. */
export type PosterSheetTitleMatch = {
  row_key: string;
  file_name: string;
  method: "title" | "title_authors";
  /** "high" is applied as is; "review" is shown for the organizer to check */
  confidence: "high" | "review";
  title_score: number;
  author_score: number | null;
  score: number;
  row_title: string;
  poster_title: string;
};

export type PosterSheetMatchResult = {
  matches: PosterSheetTitleMatch[];
  unmatched_rows: {
    row_key: string;
    title: string;
    closest: {
      file_name: string;
      title_score: number;
      author_score: number | null;
      score: number;
    } | null;
  }[];
  unmatched_files: string[];
};

/** What the wizard keeps after the user confirms a sheet. */
export type PendingPosterSheet = {
  sheetFileName: string;
  confirmedAt: string;
  template: PosterSheetMappingResult["template"];
  sheets: Record<string, PosterSheetRow[]>;
  /** Rows waiting for a title match */
  matchRows?: PosterSheetMatchRow[];
  /** row_key -> the title match applied to it */
  titleMatches?: Record<string, PosterSheetTitleMatch>;
  /** "row_key|file_name" pairs the organizer unlinked; never matched again */
  rejectedMatches?: string[];
};
