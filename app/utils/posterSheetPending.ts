import type {
  PendingPosterSheet,
  PosterSheetRow,
} from "#shared/types/posterSheetMapping";

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
