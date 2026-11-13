import type { BulkReviewMetadataGrid } from "#shared/types/bulkReviewMetadataGrid";
import type {
  PendingPosterSheet,
  PosterSheetFlaggedRow,
  PosterSheetMatchRow,
  PosterSheetPair,
  PosterSheetPairCheck,
  PosterSheetTitleMatch,
} from "#shared/types/posterSheetMapping";

/**
 * After posters extract, POST /sheets/match does two things for a confirmed
 * poster sheet:
 * - links rows that have no file yet to posters by title (and authors when
 *   titles are close), including a file suggested by the row's number when
 *   its title agrees;
 * - checks the title of every row the sheet already paired with a file (file
 *   name column, close file name, number at the start of the name), so a
 *   wrong file is caught however it was paired.
 * These helpers build that request from the grid, write matches and checks
 * back onto the pending sheet, and handle the organizer accepting or
 * unlinking a flagged pairing. Pure functions, no I/O.
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
 * Rows still waiting for a poster, paired rows not checked yet, and the
 * extracted posters. Posters without a title (still extracting) are left for
 * a later pass. Paired posters are sent too: the API checks them and keeps
 * them out of title matching.
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

  // Files a title match took are out; paired files stay in for their check.
  // A sheet confirmed before pairs were stored has no `pairs`: its linked
  // files are kept out of matching as before.
  const pairFiles = new Set(
    (pending.pairs ?? []).map((p) => lower(p.file_name)),
  );
  const linked = linkedFileNames(pending);
  const posters = grid.posters
    .filter((poster) => {
      const file = lower(poster.fileName);

      return poster.title && (pairFiles.has(file) || !linked.has(file));
    })
    .map((poster) => ({
      file_name: poster.fileName,
      title: poster.title,
      authors: authorsByPoster.get(String(poster.id)) ?? [],
    }));

  const checks = pending.pairChecks ?? {};
  const pairs = (pending.pairs ?? [])
    .filter((pair) => {
      const check = checks[pair.row_key];

      return !check || check.status === "unchecked";
    })
    .map(({ row_key, file_name, title, authors, method }) => ({
      row_key,
      file_name,
      title,
      authors,
      method,
    }));

  return { rows, posters, pairs };
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

/**
 * Keep the title checks of paired rows. "unchecked" ones (poster not
 * extracted yet) are not kept, so they are sent again on a later pass.
 */
export function applyPairChecks(
  pending: PendingPosterSheet,
  checks: PosterSheetPairCheck[] | undefined,
): PendingPosterSheet {
  if (!checks?.length) return pending;
  const pairChecks = { ...(pending.pairChecks ?? {}) };
  let changed = false;
  for (const check of checks) {
    if (!check?.row_key || check.status === "unchecked") continue;
    if (pairChecks[check.row_key]?.status === check.status) continue;
    pairChecks[check.row_key] = check;
    changed = true;
  }

  return changed ? { ...pending, pairChecks } : pending;
}

/**
 * Pairings to show for checking: title matches that needed more than the
 * exact title (number-suggested files included), and paired rows whose
 * title check disagrees. They stay listed, saved or not, until the
 * organizer accepts or unlinks each one.
 */
export function flaggedRowsToReview(
  pending: PendingPosterSheet | null,
): PosterSheetFlaggedRow[] {
  if (!pending) return [];
  const accepted = new Set(pending.acceptedMatches ?? []);
  const out: PosterSheetFlaggedRow[] = [];
  for (const match of Object.values(pending.titleMatches ?? {})) {
    if (match.confidence !== "review" || accepted.has(match.row_key)) continue;
    out.push({
      row_key: match.row_key,
      file_name: match.file_name,
      method: match.method,
      score: match.score,
      author_score: match.author_score,
      row_title: match.row_title,
      poster_title: match.poster_title,
    });
  }
  const paired = new Map(
    (pending.pairs ?? []).map((pair) => [pair.row_key, pair]),
  );
  for (const check of Object.values(pending.pairChecks ?? {})) {
    const pair = paired.get(check.row_key);
    if (!pair || check.status !== "disagree" || accepted.has(check.row_key))
      continue;
    out.push({
      row_key: check.row_key,
      file_name: check.file_name,
      method: pair.method,
      reason: check.reason,
      score: check.words_score ?? check.title_score ?? 0,
      author_score: check.author_score ?? null,
      row_title: check.row_title,
      poster_title: check.poster_title,
    });
  }

  return out;
}

/** The organizer confirms a flagged pairing; it leaves the review list. */
export function acceptFlaggedRow(
  pending: PendingPosterSheet,
  rowKey: string,
): PendingPosterSheet {
  if ((pending.acceptedMatches ?? []).includes(rowKey)) return pending;
  const beforeSheet = Object.fromEntries(
    Object.entries(pending.beforeSheet ?? {}).filter(([key]) => key !== rowKey),
  );

  return {
    ...pending,
    acceptedMatches: [...(pending.acceptedMatches ?? []), rowKey],
    beforeSheet,
  };
}

function withoutFile(
  pending: PendingPosterSheet,
  rowKey: string,
): PendingPosterSheet["sheets"] {
  const sheets: PendingPosterSheet["sheets"] = {};
  for (const [name, rows] of Object.entries(pending.sheets)) {
    sheets[name] = rows.map((row) =>
      row.row_key === rowKey ? { ...row, file_name: "" } : row,
    );
  }

  return sheets;
}

/**
 * The organizer says a flagged pairing is wrong. The row's file is removed
 * and the pair is never made again. A title match goes back to waiting; a
 * file pairing becomes a row waiting for a title match, which will not pick
 * that file again.
 */
export function unlinkFlaggedRow(
  pending: PendingPosterSheet,
  rowKey: string,
): PendingPosterSheet {
  const beforeSheet = Object.fromEntries(
    Object.entries(pending.beforeSheet ?? {}).filter(([key]) => key !== rowKey),
  );
  const acceptedMatches = (pending.acceptedMatches ?? []).filter(
    (key) => key !== rowKey,
  );

  const match = pending.titleMatches?.[rowKey];
  if (match) {
    const titleMatches = Object.fromEntries(
      Object.entries(pending.titleMatches ?? {}).filter(
        ([key]) => key !== rowKey,
      ),
    );

    return {
      ...pending,
      sheets: withoutFile(pending, rowKey),
      titleMatches,
      beforeSheet,
      acceptedMatches,
      rejectedMatches: [
        ...(pending.rejectedMatches ?? []),
        `${rowKey}|${match.file_name}`,
      ],
    };
  }

  const pair = (pending.pairs ?? []).find((p) => p.row_key === rowKey);
  if (!pair) return pending;
  const pairChecks = Object.fromEntries(
    Object.entries(pending.pairChecks ?? {}).filter(([key]) => key !== rowKey),
  );

  return {
    ...pending,
    sheets: withoutFile(pending, rowKey),
    pairs: (pending.pairs ?? []).filter((p) => p.row_key !== rowKey),
    pairChecks,
    matchRows: [
      ...(pending.matchRows ?? []).filter((row) => row.row_key !== rowKey),
      {
        row_key: rowKey,
        row: pair.row,
        title: pair.title,
        authors: pair.authors,
        number: "",
      },
    ],
    beforeSheet,
    acceptedMatches,
    rejectedMatches: [
      ...(pending.rejectedMatches ?? []),
      `${rowKey}|${pair.file_name}`,
    ],
  };
}

/** Rows that need the organizer: flagged pairings not yet accepted or unlinked. */
export function rowsToCheck(pending: PendingPosterSheet | null): Set<string> {
  return new Set(flaggedRowsToReview(pending).map((row) => row.row_key));
}

/** Sheet rows that still have no poster. */
export function rowsWithoutPoster(pending: PendingPosterSheet | null): number {
  if (!pending?.matchRows) return 0;
  const matched = new Set(Object.keys(pending.titleMatches ?? {}));

  return pending.matchRows.filter((row) => !matched.has(row.row_key)).length;
}
