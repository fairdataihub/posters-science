import type { PendingPosterSheet } from "#shared/types/posterSheetMapping";
/** Base name (last path segment), lowercased; as posterUploadBaseName stores it. */
function fileKey(name: string): string {
  const parts = name.replace(/\\/g, "/").trim().split("/").filter(Boolean);

  return (parts[parts.length - 1] ?? name).trim().toLowerCase();
}

/**
 * Point sheet rows at the uploaded posters' stored file names. The sheet may
 * have been mapped against the browser's file names while posters were still
 * uploading; once a file is stored, its row is re-linked to the stored name
 * (same base name, any case or folder). Rows whose file is not stored yet are
 * left as they are and re-linked on a later read. Returns the same object
 * when nothing changed.
 */
export function relinkPendingPosterSheet(
  pending: PendingPosterSheet,
  storedFileNames: string[],
): PendingPosterSheet {
  const stored = new Map<string, string>();
  for (const name of storedFileNames) stored.set(fileKey(name), name);
  const relink = (name: string) => {
    if (!name) return name;
    const hit = stored.get(fileKey(name));

    return hit && hit !== name ? hit : name;
  };

  let changed = false;
  const sheets: PendingPosterSheet["sheets"] = {};
  for (const [sheetName, rows] of Object.entries(pending.sheets ?? {})) {
    sheets[sheetName] = rows.map((row) => {
      const next = relink(row.file_name);
      if (next === row.file_name) return row;
      changed = true;

      return { ...row, file_name: next };
    });
  }
  const titleMatches = Object.fromEntries(
    Object.entries(pending.titleMatches ?? {}).map(([key, match]) => {
      const next = relink(match.file_name);
      if (next === match.file_name) return [key, match];
      changed = true;

      return [key, { ...match, file_name: next }];
    }),
  );

  const pairs = (pending.pairs ?? []).map((pair) => {
    const next = relink(pair.file_name);
    if (next === pair.file_name) return pair;
    changed = true;

    return { ...pair, file_name: next };
  });
  const matchRows = (pending.matchRows ?? []).map((row) => {
    if (!row.suggested_file) return row;
    const next = relink(row.suggested_file);
    if (next === row.suggested_file) return row;
    changed = true;

    return { ...row, suggested_file: next };
  });

  return changed
    ? {
        ...pending,
        sheets,
        titleMatches,
        ...(pending.pairs ? { pairs } : {}),
        ...(pending.matchRows ? { matchRows } : {}),
      }
    : pending;
}

/** Light shape check on a pending sheet sent by the browser. */
export function isPendingPosterSheet(
  value: unknown,
): value is PendingPosterSheet {
  if (!value || typeof value !== "object") return false;
  const sheet = value as Partial<PendingPosterSheet>;
  if (typeof sheet.sheetFileName !== "string") return false;
  if (!sheet.sheets || typeof sheet.sheets !== "object") return false;

  return Object.values(sheet.sheets).every(
    (rows) =>
      Array.isArray(rows) &&
      rows.every(
        (row) =>
          row &&
          typeof row === "object" &&
          typeof (row as { file_name?: unknown }).file_name === "string",
      ),
  );
}
