import type { BulkReviewMetadataGrid } from "#shared/types/bulkReviewMetadataGrid";
import type {
  PendingPosterSheet,
  PosterSheetMatchResult,
  PosterSheetRow,
  PosterSheetTitleMatch,
} from "#shared/types/posterSheetMapping";
import {
  applyTitleMatches,
  titleMatchInput,
  unlinkTitleMatch,
} from "#shared/utils/posterSheetTitleMatch";

/**
 * Keeps a confirmed poster sheet until its rows are saved into the metadata
 * grid. The sheet is confirmed on the upload step, but grid rows only exist
 * once posters finish extracting, so the rows wait here and are merged in as
 * posters arrive. Rows leave once a grid save that included them succeeds.
 *
 * Stored per browser for now (draft). Moving this onto the bulk job record is
 * a follow-up so a batch can be resumed on another device.
 */

const PREFIX = "posters-science:poster-sheet:";

function key(jobId: string) {
  return `${PREFIX}${jobId}`;
}

export function readPendingPosterSheet(
  jobId: string | null,
): PendingPosterSheet | null {
  if (!jobId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(jobId));

    return raw ? (JSON.parse(raw) as PendingPosterSheet) : null;
  } catch {
    return null;
  }
}

export function writePendingPosterSheet(
  jobId: string,
  sheet: PendingPosterSheet,
) {
  try {
    window.localStorage.setItem(key(jobId), JSON.stringify(sheet));
  } catch {
    // Storage blocked or full: the rows still apply in this tab via the event below.
  }
  window.dispatchEvent(
    new CustomEvent("poster-sheet-updated", { detail: { jobId } }),
  );
}

export function clearPendingPosterSheet(jobId: string) {
  try {
    window.localStorage.removeItem(key(jobId));
  } catch {
    // ignore
  }
}

/** Drop rows for posters whose sheet values were saved; keep the rest pending. */
export function forgetSavedPosterSheetRows(
  jobId: string | null,
  fileNames: string[],
) {
  if (!jobId || !fileNames.length) return;
  const pending = readPendingPosterSheet(jobId);
  if (!pending) return;
  const saved = new Set(fileNames.map((name) => name.toLowerCase()));
  const sheets: Record<string, PosterSheetRow[]> = {};
  for (const [name, rows] of Object.entries(pending.sheets)) {
    const left = rows.filter((row) => !saved.has(row.file_name.toLowerCase()));
    if (left.length) sheets[name] = left;
  }
  if (Object.keys(sheets).length === 0) {
    clearPendingPosterSheet(jobId);
  } else {
    try {
      window.localStorage.setItem(
        key(jobId),
        JSON.stringify({ ...pending, sheets }),
      );
    } catch {
      // ignore
    }
  }
}

/**
 * Link sheet rows that have no file name to extracted posters by title (and
 * authors when titles are close). Runs whenever the grid loads, so posters
 * that finish extracting later are matched on a later load. Returns the
 * matches applied in this pass.
 */
export async function matchPendingPosterSheetByTitle(
  jobId: string | null,
  grid: BulkReviewMetadataGrid,
): Promise<PosterSheetTitleMatch[]> {
  const pending = readPendingPosterSheet(jobId);
  if (!jobId || !pending?.matchRows?.length) return [];
  const input = titleMatchInput(pending, grid);
  if (!input.rows.length || !input.posters.length) return [];
  try {
    const result = await $fetch<PosterSheetMatchResult>(
      `/api/bulk-poster-submissions/${jobId}/poster-sheet-match`,
      { method: "POST", body: input },
    );
    const { pending: next, applied } = applyTitleMatches(
      pending,
      result.matches,
    );
    if (applied.length) writePendingPosterSheet(jobId, next);

    return applied;
  } catch {
    // Matching is a helper: the grid still loads, and rows wait for the next try.
    return [];
  }
}

export function unlinkPendingTitleMatch(jobId: string | null, rowKey: string) {
  const pending = readPendingPosterSheet(jobId);
  if (!jobId || !pending) return;
  writePendingPosterSheet(jobId, unlinkTitleMatch(pending, rowKey));
}
