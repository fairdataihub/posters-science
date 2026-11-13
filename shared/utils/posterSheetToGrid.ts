import type {
  BulkReviewGridRow,
  BulkReviewMetadataGrid,
} from "#shared/types/bulkReviewMetadataGrid";
import type { PosterSheetRow } from "#shared/types/posterSheetMapping";

/**
 * Merge rows from an organizer's poster sheet into the metadata grid.
 *
 * What the sheet gives is the source of truth: a sheet value replaces the
 * extracted one, with no merging. Extraction only fills fields the sheet does
 * not have, or leaves empty.
 *
 * - One-row-per-poster tabs (About the Poster, Additional information):
 *   filled sheet cells overwrite the matching cells (keywords included).
 * - List tabs (Creators, Related resources, ...): when the sheet gives rows
 *   for a poster, they replace that poster's extracted rows. On Creators, an empty ORCID,
 *   affiliation or ROR on a sheet person is filled from extraction only when
 *   exactly one extracted person matches (Jun Wang and Jie Wang are both
 *   "J Wang", so a sheet "J Wang" gets neither's identifiers).
 * - Posters no sheet row reaches keep their extracted metadata only.
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

/**
 * Keep identifiers extraction found when the sheet names the same person and
 * affiliations. Only when exactly one extracted person matches; two matches
 * (same family name and initial) are left for the organizer.
 */
function carryIdentifiers(
  sheetRow: BulkReviewGridRow,
  extracted: BulkReviewGridRow[],
) {
  let matches = extracted.filter((row) => samePerson(sheetRow, row));
  // Several share the family name and initial: a full given name can still
  // single one out (Jie Wang among Jun and Jie Wang).
  if (matches.length > 1 && norm(sheetRow.given_name).length > 1) {
    matches = matches.filter(
      (row) => norm(row.given_name) === norm(sheetRow.given_name),
    );
  }
  if (matches.length !== 1) return;
  const match = matches[0]!;
  if (!sheetRow.name_identifier && match.name_identifier) {
    sheetRow.name_identifier = match.name_identifier;
  }
  // No affiliation in the sheet for this person: keep the extracted ones.
  const sheetHasAffiliation = Object.entries(sheetRow).some(
    ([key, value]) => AFFILIATION_NAME.test(key) && value,
  );
  if (!sheetHasAffiliation) {
    for (const [key, value] of Object.entries(match)) {
      if (key.startsWith("contributor_affiliation_") && key in sheetRow) {
        sheetRow[key] = value;
      }
    }

    return;
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

      // The sheet's list replaces the extracted list for this poster.
      const extracted = list.filter((row) => row.poster_id === posterId);
      const next = posterRows.map((sheetRow) => {
        const row = toRow(sheetRow);
        if (sheet.name === CREATORS_SHEET) {
          // A lone name is a family name (Zenodo needs one for a person).
          if (!row.family_name && row.given_name) {
            row.family_name = row.given_name;
            row.given_name = "";
          }
          carryIdentifiers(row, extracted);
        }

        return row as Row;
      });
      const at = extracted.length ? list.indexOf(extracted[0]!) : list.length;
      const without = list.filter((row) => row.poster_id !== posterId);
      without.splice(Math.min(at, without.length), 0, ...next);
      list.splice(0, list.length, ...without);
      changed.add(posterId);
    }

    rows[sheet.name] = list;
  }

  return {
    rows,
    appliedFileNames: [...applied],
    changedPosterIds: [...changed],
  };
}
