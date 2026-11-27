import type { BulkReviewMetadataGrid } from "#shared/types/bulkReviewMetadataGrid";
import type {
  PendingPosterSheet,
  PosterSheetMatchRow,
  PosterSheetPair,
  PosterSheetTitleMatch,
} from "#shared/types/posterSheetMapping";

/**
 * After posters extract, POST /sheets/match links worksheet rows that have
 * no file yet to posters by title (and authors when titles are close),
 * including a file suggested by the row's number when its title agrees.
 * These helpers build that request from the grid and write the matches back
 * onto the pending sheet. Posters left without a row keep what was read
 * from them. Pure functions, no I/O.
 */

const CREATORS_SHEET = "Creators";

export type TitleMatchInput = {
  rows: (Pick<PosterSheetMatchRow, "row_key" | "title" | "authors"> & {
    suggested_file?: string;
  })[];
  posters: { file_name: string; title: string; authors: string[] }[];
  /** Paired rows still to check */
  pairs: Pick<
    PosterSheetPair,
    "row_key" | "file_name" | "title" | "authors" | "method"
  >[];
};

function lower(name: string) {
  return name.trim().toLowerCase();
}

/** Files already taken by a pairing or a title match. */
function linkedFileNames(pending: PendingPosterSheet): Set<string> {
  const linked = new Set<string>();
  for (const pair of pending.pairs ?? []) linked.add(lower(pair.file_name));
  for (const rows of Object.values(pending.sheets)) {
    for (const row of rows) if (row.file_name) linked.add(lower(row.file_name));
  }
  for (const match of Object.values(pending.titleMatches ?? {})) {
    linked.add(lower(match.file_name));
  }

  return linked;
}

/**
 * Rows still waiting for a poster, and the extracted posters no row is
 * linked to yet. Posters without a title (still extracting) are left for a
 * later pass.
 */
export function titleMatchInput(
  pending: PendingPosterSheet,
  grid: BulkReviewMetadataGrid,
): TitleMatchInput {
  const matched = new Set(Object.keys(pending.titleMatches ?? {}));
  const rows = (pending.matchRows ?? [])
    .filter(
      (row) => !matched.has(row.row_key) && (row.title || row.authors.length),
    )
    .map(({ row_key, title, authors, suggested_file }) => ({
      row_key,
      title,
      authors,
      ...(suggested_file ? { suggested_file } : {}),
    }));

  const authorsByPoster = new Map<string, string[]>();
  const creators = grid.sheets.find((sheet) => sheet.name === CREATORS_SHEET);
  for (const row of creators?.rows ?? []) {
    const name = [row.given_name, row.family_name].filter(Boolean).join(" ");
    if (!row.poster_id || !name) continue;
    authorsByPoster.set(row.poster_id, [
      ...(authorsByPoster.get(row.poster_id) ?? []),
      name,
    ]);
  }

  // Files already linked (file name column, number, or an earlier title
  // match) are kept out of title matching.
  const linked = linkedFileNames(pending);
  const posters = grid.posters
    .filter((poster) => poster.title && !linked.has(lower(poster.fileName)))
    .map((poster) => ({
      file_name: poster.fileName,
      title: poster.title,
      authors: authorsByPoster.get(String(poster.id)) ?? [],
    }));

  return { rows, posters, pairs: [] };
}

/** Apply new matches: each matched row now carries its poster's file name. */
export function applyTitleMatches(
  pending: PendingPosterSheet,
  matches: PosterSheetTitleMatch[],
): { pending: PendingPosterSheet; applied: PosterSheetTitleMatch[] } {
  const titleMatches = { ...(pending.titleMatches ?? {}) };
  const taken = linkedFileNames(pending);
  const applied: PosterSheetTitleMatch[] = [];
  for (const match of matches) {
    if (titleMatches[match.row_key] || taken.has(lower(match.file_name)))
      continue;
    titleMatches[match.row_key] = match;
    taken.add(lower(match.file_name));
    applied.push(match);
  }
  if (!applied.length) return { pending, applied };

  const sheets: PendingPosterSheet["sheets"] = {};
  for (const [name, rows] of Object.entries(pending.sheets)) {
    sheets[name] = rows.map((row) => {
      const match = !row.file_name && titleMatches[row.row_key];

      return match ? { ...row, file_name: match.file_name } : row;
    });
  }

  return { pending: { ...pending, sheets, titleMatches }, applied };
}
