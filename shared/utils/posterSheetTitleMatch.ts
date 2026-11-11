import type { BulkReviewMetadataGrid } from "#shared/types/bulkReviewMetadataGrid";
import type {
  PendingPosterSheet,
  PosterSheetMatchRow,
  PosterSheetTitleMatch,
} from "#shared/types/posterSheetMapping";

/**
 * Rows from a poster sheet that has no file name column are linked to posters
 * by title once the posters extract (POST /sheets/match). These helpers build
 * the request from the grid, write the matches back onto the pending sheet,
 * and undo a match the organizer rejects. Pure functions, no I/O.
 */

const CREATORS_SHEET = "Creators";

export type TitleMatchInput = {
  rows: Pick<PosterSheetMatchRow, "row_key" | "title" | "authors">[];
  posters: { file_name: string; title: string; authors: string[] }[];
};

function lower(name: string) {
  return name.trim().toLowerCase();
}

function linkedFileNames(pending: PendingPosterSheet): Set<string> {
  const linked = new Set<string>();
  for (const rows of Object.values(pending.sheets)) {
    for (const row of rows) if (row.file_name) linked.add(lower(row.file_name));
  }
  for (const match of Object.values(pending.titleMatches ?? {})) {
    linked.add(lower(match.file_name));
  }

  return linked;
}

/**
 * Rows still waiting for a poster, and extracted posters no sheet row claims
 * yet. Posters without a title (still extracting) are left for a later pass.
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
    .map(({ row_key, title, authors }) => ({ row_key, title, authors }));

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

  const linked = linkedFileNames(pending);
  const posters = grid.posters
    .filter((poster) => poster.title && !linked.has(lower(poster.fileName)))
    .map((poster) => ({
      file_name: poster.fileName,
      title: poster.title,
      authors: authorsByPoster.get(String(poster.id)) ?? [],
    }));

  return { rows, posters };
}

/** Apply new matches: each matched row now carries its poster's file name. */
export function applyTitleMatches(
  pending: PendingPosterSheet,
  matches: PosterSheetTitleMatch[],
): { pending: PendingPosterSheet; applied: PosterSheetTitleMatch[] } {
  const rejected = new Set(pending.rejectedMatches ?? []);
  const titleMatches = { ...(pending.titleMatches ?? {}) };
  const taken = linkedFileNames(pending);
  const applied: PosterSheetTitleMatch[] = [];
  for (const match of matches) {
    if (rejected.has(`${match.row_key}|${match.file_name}`)) continue;
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

/** Undo one title match; the pair is remembered so it is not matched again. */
export function unlinkTitleMatch(
  pending: PendingPosterSheet,
  rowKey: string,
): PendingPosterSheet {
  const match = pending.titleMatches?.[rowKey];
  if (!match) return pending;
  const titleMatches = Object.fromEntries(
    Object.entries(pending.titleMatches ?? {}).filter(
      ([key]) => key !== rowKey,
    ),
  );
  const sheets: PendingPosterSheet["sheets"] = {};
  for (const [name, rows] of Object.entries(pending.sheets)) {
    sheets[name] = rows.map((row) =>
      row.row_key === rowKey ? { ...row, file_name: "" } : row,
    );
  }

  return {
    ...pending,
    sheets,
    titleMatches,
    rejectedMatches: [
      ...(pending.rejectedMatches ?? []),
      `${rowKey}|${match.file_name}`,
    ],
  };
}

/** Title matches to show for checking: "review" ones whose rows are not saved yet. */
export function titleMatchesToReview(
  pending: PendingPosterSheet | null,
): PosterSheetTitleMatch[] {
  if (!pending?.titleMatches) return [];
  const unsaved = new Set<string>();
  for (const rows of Object.values(pending.sheets)) {
    for (const row of rows) if (row.file_name) unsaved.add(row.row_key);
  }

  return Object.values(pending.titleMatches).filter(
    (match) => match.confidence === "review" && unsaved.has(match.row_key),
  );
}

/** Sheet rows that still have no poster. */
export function rowsWithoutPoster(pending: PendingPosterSheet | null): number {
  if (!pending?.matchRows) return 0;
  const matched = new Set(Object.keys(pending.titleMatches ?? {}));

  return pending.matchRows.filter((row) => !matched.has(row.row_key)).length;
}
