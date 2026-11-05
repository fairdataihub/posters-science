import type {
  BulkReviewColumnRequirement,
  BulkReviewWorkbookSheet,
} from "#shared/bulkReviewWorkbookManifest";

/** One editable row, keyed by manifest fillKey. */
export type BulkReviewGridRow = Record<string, string>;

export type BulkReviewGridColumn = {
  header: string;
  fillKey: string;
  requirement: BulkReviewColumnRequirement;
  /** Poster ID / file name: shown but not editable */
  system: boolean;
  instruction?: string;
  hint?: string;
  width?: number;
  wrapText?: boolean;
};

export type BulkReviewGridSheet = {
  name: string;
  description: string;
  grain: BulkReviewWorkbookSheet["grain"];
  /** "poster" sheets have exactly one row per poster; others are repeatable lists */
  repeatable: boolean;
  /** Singular label for one row, e.g. "funder" */
  rowNoun?: string;
  columns: BulkReviewGridColumn[];
  rows: BulkReviewGridRow[];
};

export type BulkReviewGridPoster = {
  id: number;
  fileName: string;
  title: string;
};

export type BulkReviewMetadataGrid = {
  posters: BulkReviewGridPoster[];
  sheets: BulkReviewGridSheet[];
};

export type BulkReviewMetadataGridSaveBody = {
  sheets: Record<string, BulkReviewGridRow[]>;
};
