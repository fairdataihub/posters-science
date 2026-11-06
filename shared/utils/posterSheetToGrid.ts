import type {
  BulkReviewGridRow,
  BulkReviewMetadataGrid,
} from "#shared/types/bulkReviewMetadataGrid";
import type { PosterSheetRow } from "#shared/types/posterSheetMapping";

/**
 * Merge rows from an organizer's poster sheet into the metadata grid.
 *
 * The sheet wins over extraction (Oct 28 decision): a non-empty sheet value
 * replaces the extracted one. Empty sheet cells never erase anything.
 *
 * - One-row-per-poster tabs (About the Poster, Additional information):
 *   sheet values overwrite the matching cells.
 * - Creators: the sheet's author list replaces the extracted one for that
 *   poster, keeping an extracted ORCID or ROR when the same person or
 *   affiliation is on both.
 * - Other list tabs (Related resources, ...): sheet rows are added unless the
 *   same identifier is already there.
 *
 * Rows link by file name. Posters not in the grid yet (still extracting) are
 * left for a later merge and are not reported as applied.
 */

const CREATORS_SHEET = "Creators";
const AFFILIATION_NAME = /^contributor_affiliation_(\d+)_name$/;

export type PosterSheetMergeResult<Row extends BulkReviewGridRow> = {
  rows: Record<string, Row[]>;
  /** File names whose sheet rows are now in the grid */
  appliedFileNames: string[];
  /** Poster ids with at least one changed cell or row */
  changedPosterIds: string[];
};

function fileKey(name: string): string {
  return (name.split(/[\\/]/).pop() ?? name).trim().toLowerCase();
}

function norm(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function samePerson(a: BulkReviewGridRow, b: BulkReviewGridRow): boolean {
  const familyA = norm(a.family_name);
  if (!familyA || familyA !== norm(b.family_name)) return false;
  const givenA = norm(a.given_name);
  const givenB = norm(b.given_name);

  return !givenA || !givenB || givenA[0] === givenB[0];
}

/** Keep identifiers extraction found when the sheet names the same person and affiliations. */
function carryIdentifiers(
  sheetRow: BulkReviewGridRow,
  extracted: BulkReviewGridRow[],
) {
  const match = extracted.find((row) => samePerson(sheetRow, row));
  if (!match) return;
  if (!sheetRow.name_identifier && match.name_identifier) {
    sheetRow.name_identifier = match.name_identifier;
  }
  const rorByName = new Map<string, string>();
  for (const [key, value] of Object.entries(match)) {
    const slot = AFFILIATION_NAME.exec(key)?.[1];
    const ror = slot ? match[`contributor_affiliation_${slot}_ror`] : "";
    if (value && ror) rorByName.set(norm(value), ror);
  }
  for (const [key, value] of Object.entries(sheetRow)) {
    const slot = AFFILIATION_NAME.exec(key)?.[1];
    if (!slot || !value) continue;
    const rorKey = `contributor_affiliation_${slot}_ror`;
    const ror = rorByName.get(norm(value));
    if (ror && !sheetRow[rorKey]) sheetRow[rorKey] = ror;
  }
}

function relationKey(row: BulkReviewGridRow): string {
  return norm(
    row.related_identifier ??
      row.identifier ??
      row.funder_name ??
      JSON.stringify(row),
  );
}

export function mergePosterSheetIntoGrid<Row extends BulkReviewGridRow>(
  grid: Pick<BulkReviewMetadataGrid, "posters" | "sheets">,
  current: Record<string, Row[]>,
  sheetRows: Record<string, PosterSheetRow[]>,
): PosterSheetMergeResult<Row> {
  const posterIdByFile = new Map<string, string>();
  for (const poster of grid.posters) {
    posterIdByFile.set(fileKey(poster.fileName), String(poster.id));
  }

  const rows: Record<string, Row[]> = {};
  for (const [name, list] of Object.entries(current)) rows[name] = [...list];

  const applied = new Set<string>();
  const changed = new Set<string>();

  for (const sheet of grid.sheets) {
    const incoming = sheetRows[sheet.name];
    if (!incoming?.length) continue;
    const columns = new Set(sheet.columns.map((column) => column.fillKey));
    const list = rows[sheet.name] ?? [];

    const blankRow = (
      posterId: string,
      fileName: string,
    ): BulkReviewGridRow => {
      const row: BulkReviewGridRow = {};
      for (const key of columns) row[key] = "";
      row.poster_id = posterId;
      if (columns.has("file_name")) row.file_name = fileName;

      return row;
    };

    // Group sheet rows by poster.
    const byPoster = new Map<string, PosterSheetRow[]>();
    for (const sheetRow of incoming) {
      const posterId = posterIdByFile.get(fileKey(sheetRow.file_name));
      if (!posterId) continue;
      applied.add(sheetRow.file_name);
      byPoster.set(posterId, [...(byPoster.get(posterId) ?? []), sheetRow]);
    }

    for (const [posterId, posterRows] of byPoster) {
      const fileName =
        grid.posters.find((poster) => String(poster.id) === posterId)
          ?.fileName ?? "";

      if (!sheet.repeatable) {
        let target = list.find((row) => row.poster_id === posterId);
        if (!target) {
          target = blankRow(posterId, fileName) as Row;
          list.push(target);
          changed.add(posterId);
        }
        const updated = { ...target } as Row;
        for (const sheetRow of posterRows) {
          for (const [key, value] of Object.entries(sheetRow)) {
            if (key === "file_name" || !columns.has(key) || !value) continue;
            if (updated[key] !== value) {
              (updated as BulkReviewGridRow)[key] = value;
              changed.add(posterId);
            }
          }
        }
        list.splice(list.indexOf(target), 1, updated);
        continue;
      }

      const toRow = (sheetRow: PosterSheetRow): BulkReviewGridRow => {
        const row = blankRow(posterId, fileName);
        for (const [key, value] of Object.entries(sheetRow)) {
          if (key !== "file_name" && columns.has(key) && value)
            row[key] = value;
        }

        return row;
      };

      if (sheet.name === CREATORS_SHEET) {
        const extracted = list.filter((row) => row.poster_id === posterId);
        const next = posterRows.map((sheetRow) => {
          const row = toRow(sheetRow);
          carryIdentifiers(row, extracted);

          return row as Row;
        });
        const at = extracted.length ? list.indexOf(extracted[0]!) : list.length;
        const without = list.filter((row) => row.poster_id !== posterId);
        without.splice(Math.min(at, without.length), 0, ...next);
        list.splice(0, list.length, ...without);
        changed.add(posterId);
        continue;
      }

      const existing = new Set(
        list.filter((row) => row.poster_id === posterId).map(relationKey),
      );
      for (const sheetRow of posterRows) {
        const row = toRow(sheetRow);
        if (existing.has(relationKey(row))) continue;
        existing.add(relationKey(row));
        list.push(row as Row);
        changed.add(posterId);
      }
    }

    rows[sheet.name] = list;
  }

  return {
    rows,
    appliedFileNames: [...applied],
    changedPosterIds: [...changed],
  };
}
