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

/**
 * Why a sheet was refused and where (POST /sheets/map 422 `issues`). file,
 * sheet and row are null when the problem is not at one place, such as a
 * required file that was not added. row is 1-based, as in Excel.
 */
export type PosterSheetIssue = {
  message: string;
  file: string | null;
  sheet: string | null;
  row: number | null;
  /** Columns the format needs that the header row lacks */
  missing: string[];
  /** Columns the header row has */
  found: string[];
  /**
   * The organizer added the wrong files (a file type, an extra or missing
   * file) and can fix it without us, so the dialog doesn't offer Send it to us.
   */
  fixable?: boolean;
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
  /**
   * A file whose name has this row's number somewhere other than the start
   * (Smith_poster (2).pdf). Taken, for review, only when the titles agree.
   */
  suggested_file?: string;
};

/** A row the sheet already paired with a file (POST /sheets/map `pairs`). */
export type PosterSheetPair = {
  row_key: string;
  row: number;
  file_name: string;
  /**
   * File name column, close file name, a file name that starts with the row's
   * number, or (column_unverified) the sheet's file name before any poster was
   * uploaded, re-linked once that file is stored
   */
  method: "column" | "column_fuzzy" | "column_unverified" | "number";
  title: string;
  authors: string[];
};

/**
 * Title check on a paired row after extraction (POST /sheets/match
 * `pair_checks`): does the extracted poster look like the sheet row?
 */
export type PosterSheetPairCheck = {
  row_key: string;
  file_name: string;
  method: string;
  status: "agree" | "disagree" | "unchecked";
  /** Why it disagrees (title, authors) or was not checked (not_extracted, no_title) */
  reason: "title" | "authors" | "not_extracted" | "no_title" | null;
  title_score?: number;
  words_score?: number;
  author_score?: number | null;
  row_title: string;
  poster_title: string;
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
    /** Rows linked by each tier: exact file name, close file name, number */
    methods?: Partial<
      Record<"column" | "column_fuzzy" | "column_unverified" | "number", number>
    >;
    matched_rows: number;
    rows: number;
  } | null;
  /** Sheet name -> rows, using the metadata grid's sheet names and fillKeys */
  sheets: Record<string, PosterSheetRow[]>;
  unmatched_rows: { row: number; value: string; title: string }[];
  unmatched_files: string[];
  /** Rows with no file yet, to match by title after extraction */
  match_rows: PosterSheetMatchRow[];
  /** Every row linked to a file, with how it was linked (title-checked after extraction) */
  pairs?: PosterSheetPair[];
  /**
   * Per row notes: the project license from EasyChair form fields, and an
   * existing DOI for the poster itself (not a related link).
   */
  hints: Record<string, { project_license?: string; doi?: string }>;
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
  /**
   * Tier that placed it: exact title, title plus authors, bag of words, best
   * of what was left, or a file with the row's number in its name whose title agrees
   */
  method:
    | "title"
    | "title_authors"
    | "words_fuzzy"
    | "best_remaining"
    | "number_suggested";
  /** "high" is applied as is; "review" is shown for the organizer to check */
  confidence: "high" | "review";
  /** Loop round that made the match */
  round?: number;
  title_score: number;
  /** Bag of words score, spelling slips allowed */
  words_score?: number;
  author_score: number | null;
  score: number;
  row_title: string;
  poster_title: string;
};

export type PosterSheetMatchResult = {
  matches: PosterSheetTitleMatch[];
  /** Title check on every paired row sent in `pairs` */
  pair_checks?: PosterSheetPairCheck[];
  /** The pair checks that disagree */
  flagged?: PosterSheetPairCheck[];
  unmatched_rows: {
    row_key: string;
    title: string;
    closest: {
      file_name: string;
      title_score: number;
      words_score?: number;
      author_score: number | null;
      score: number;
    } | null;
  }[];
  unmatched_files: string[];
};

/**
 * A pairing the organizer should check: a title match that needed more than
 * the exact title, or a file name or number pairing whose titles disagree.
 */
export type PosterSheetFlaggedRow = {
  row_key: string;
  file_name: string;
  /** How the row was paired; for a file pairing, why the check failed */
  method: PosterSheetTitleMatch["method"] | PosterSheetPair["method"];
  reason?: PosterSheetPairCheck["reason"];
  score: number;
  author_score: number | null;
  row_title: string;
  poster_title: string;
  /** The row's number in the organizer's sheet, when known */
  row_number?: number;
  /** Authors in the sheet row */
  row_authors: string[];
  /** Authors read from the poster (before the sheet filled it); null when not known */
  poster_authors: string[] | null;
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
  /** row_keys of flagged matches the organizer accepted */
  acceptedMatches?: string[];
  /** Rows the sheet paired with a file; kept after their rows are saved */
  pairs?: PosterSheetPair[];
  /** row_key -> title check of a paired row (agree or disagree; unchecked ones are retried) */
  pairChecks?: Record<string, PosterSheetPairCheck>;
  /** Per row notes from the sheet (project license, the poster's own DOI) */
  hints?: PosterSheetMappingResult["hints"];
  /**
   * row_key -> that poster's grid rows before the sheet filled them, kept for
   * flagged rows only, so unlinking can put the extracted values back even
   * after a save.
   */
  beforeSheet?: Record<string, Record<string, Record<string, string>[]>>;
  /** Poster file names the browser had when the sheet was mapped (some may still be uploading) */
  browserFileNames?: string[];
  /**
   * Posters with no worksheet row at Review, and the ones the organizer has
   * seen the notice for. The sheet is kept until all are seen.
   */
  unmatchedFiles?: string[];
  unmatchedDecided?: string[];
};

/** A poster no worksheet row is linked to; it keeps what was read from it. */
export type UnmatchedPoster = {
  posterId: number;
  fileName: string;
  /** no_row: nothing paired it; unlinked: the organizer unlinked its row */
  reason: "no_row" | "unlinked";
};
