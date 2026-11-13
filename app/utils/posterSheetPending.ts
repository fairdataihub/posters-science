import type { BulkReviewMetadataGrid } from "#shared/types/bulkReviewMetadataGrid";
import type {
  PendingPosterSheet,
  PosterSheetMatchResult,
  PosterSheetRow,
  PosterSheetTitleMatch,
} from "#shared/types/posterSheetMapping";
import {
  acceptFlaggedRow,
  applyPairChecks,
  applyTitleMatches,
  flaggedRowsToReview,
  titleMatchInput,
  unlinkFlaggedRow,
} from "#shared/utils/posterSheetTitleMatch";

/**
 * Keeps a confirmed poster sheet until its rows are saved into the metadata
 * grid and every flagged pairing is checked. The sheet is confirmed on the
 * upload step, but grid rows only exist once posters finish extracting, so
 * the rows wait and are merged in as posters arrive.
 *
 * The sheet is stored on the bulk submission (GET/PUT/DELETE
 * /api/bulk-poster-submissions/:jobId/poster-sheet-pending), so it survives a
 * reload, a cleared cache or another device. The browser keeps a copy in
 * memory and localStorage only so the grid can read it synchronously; call
 * loadPendingPosterSheet before reading after a page load.
 */

const PREFIX = "posters-science:poster-sheet:";
const cache = new Map<string, PendingPosterSheet | null>();
/** Writes per job go out in order, so an older save never lands last. */
const writes = new Map<string, Promise<unknown>>();

function key(jobId: string) {
  return `${PREFIX}${jobId}`;
}

function endpoint(jobId: string) {
  return `/api/bulk-poster-submissions/${jobId}/poster-sheet-pending`;
}

function readLocal(jobId: string): PendingPosterSheet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(jobId));

    return raw ? (JSON.parse(raw) as PendingPosterSheet) : null;
  } catch {
    return null;
  }
}

function writeLocal(jobId: string, sheet: PendingPosterSheet | null) {
  try {
    if (sheet) window.localStorage.setItem(key(jobId), JSON.stringify(sheet));
    else window.localStorage.removeItem(key(jobId));
  } catch {
    // Storage blocked or full: the server copy is the one that counts.
  }
}

function setCached(jobId: string, sheet: PendingPosterSheet | null) {
  cache.set(jobId, sheet);
  writeLocal(jobId, sheet);
  window.dispatchEvent(
    new CustomEvent("poster-sheet-updated", { detail: { jobId } }),
  );
}

function enqueue(jobId: string, task: () => Promise<unknown>) {
  const next = (writes.get(jobId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(task)
    .catch((error) => {
      console.error("[poster-sheet] could not save the pending sheet", error);
    });
  writes.set(jobId, next);

  return next;
}

/** The cached pending sheet (synchronous). */
export function readPendingPosterSheet(
  jobId: string | null,
): PendingPosterSheet | null {
  if (!jobId || typeof window === "undefined") return null;
  if (cache.has(jobId)) return cache.get(jobId) ?? null;

  return readLocal(jobId);
}

/**
 * Fetch the pending sheet from the server and refresh the cache. A sheet that
 * exists only in this browser (confirmed before sheets were stored on the
 * batch) is sent up once. Falls back to the cached copy when offline.
 */
export async function loadPendingPosterSheet(
  jobId: string | null,
): Promise<PendingPosterSheet | null> {
  if (!jobId || typeof window === "undefined") return null;
  await writes.get(jobId);
  try {
    const { pending } = await $fetch<{ pending: PendingPosterSheet | null }>(
      endpoint(jobId),
    );
    if (pending) {
      cache.set(jobId, pending);
      writeLocal(jobId, pending);

      return pending;
    }
    const local = readLocal(jobId);
    if (local) {
      await writePendingPosterSheet(jobId, local);

      return local;
    }
    cache.set(jobId, null);

    return null;
  } catch {
    return readPendingPosterSheet(jobId);
  }
}

export function writePendingPosterSheet(
  jobId: string,
  sheet: PendingPosterSheet,
): Promise<unknown> {
  setCached(jobId, sheet);

  return enqueue(jobId, () =>
    $fetch(endpoint(jobId), {
      method: "PUT",
      body: JSON.stringify(sheet),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

export function clearPendingPosterSheet(jobId: string): Promise<unknown> {
  setCached(jobId, null);

  return enqueue(jobId, () => $fetch(endpoint(jobId), { method: "DELETE" }));
}

/**
 * Drop rows for posters whose sheet values were saved; keep the rest pending.
 * Flagged pairings stay until each is accepted or unlinked; the sheet is
 * cleared once no rows and no flags are left.
 */
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
  const next = { ...pending, sheets };
  const waiting = (next.matchRows ?? []).some(
    (row) => !next.titleMatches?.[row.row_key],
  );
  if (
    Object.keys(sheets).length === 0 &&
    !waiting &&
    flaggedRowsToReview(next).length === 0
  ) {
    void clearPendingPosterSheet(jobId);
  } else {
    void writePendingPosterSheet(jobId, next);
  }
}

/**
 * Link sheet rows that have no file name to extracted posters by title (and
 * authors when titles are close), and check the titles of rows paired by file
 * name or number. Runs whenever the grid loads, so posters that finish
 * extracting later are handled on a later load. Returns the matches applied in
 * this pass.
 */
export async function matchPendingPosterSheetByTitle(
  jobId: string | null,
  grid: BulkReviewMetadataGrid,
): Promise<PosterSheetTitleMatch[]> {
  const pending = readPendingPosterSheet(jobId);
  if (!jobId || !pending) return [];
  const input = titleMatchInput(pending, grid);
  const hasRows = input.rows.length && input.posters.length;
  if (!hasRows && !input.pairs.length) return [];
  try {
    const result = await $fetch<PosterSheetMatchResult>(
      `/api/bulk-poster-submissions/${jobId}/poster-sheet-match`,
      { method: "POST", body: input },
    );
    const matched = applyTitleMatches(pending, result.matches ?? []);
    const checked = applyPairChecks(matched.pending, result.pair_checks);
    if (matched.applied.length || checked !== matched.pending) {
      await writePendingPosterSheet(jobId, checked);
    }

    return matched.applied;
  } catch {
    // Matching is a helper: the grid still loads, and rows wait for the next try.
    return [];
  }
}

/** The organizer says a flagged pairing is right. */
export function acceptPendingFlaggedRow(jobId: string | null, rowKey: string) {
  const pending = readPendingPosterSheet(jobId);
  if (!jobId || !pending) return;
  void writePendingPosterSheet(jobId, acceptFlaggedRow(pending, rowKey));
}

/** The organizer says a flagged pairing is wrong; the pair is never made again. */
export function unlinkPendingFlaggedRow(jobId: string | null, rowKey: string) {
  const pending = readPendingPosterSheet(jobId);
  if (!jobId || !pending) return;
  void writePendingPosterSheet(jobId, unlinkFlaggedRow(pending, rowKey));
}
