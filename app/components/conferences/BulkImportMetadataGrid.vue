<script setup lang="ts">
import BulkImportMetadataGridRow from "~/components/conferences/BulkImportMetadataGridRow.vue";
import { strictIssueMessage } from "~/utils/strictIssueLabel";
import { onKeyStroke, useElementSize, useScrollLock } from "@vueuse/core";
import type {
  BulkReviewGridColumn,
  BulkReviewGridRow,
  BulkReviewGridSheet,
  BulkReviewMetadataGrid,
} from "#shared/types/bulkReviewMetadataGrid";
import type { BulkImportValidationIssue } from "#shared/types/bulkImportValidation";
import {
  getBulkReviewMetadataGrid,
  saveBulkReviewMetadataGrid,
  getBulkReviewMetadataValidation,
} from "~/utils/bulkPosterSubmissionJobClient";
import {
  bulkReviewGridChoiceLabel,
  bulkReviewGridChoicesForFillKey,
} from "~/utils/bulkReviewGridFieldChoices";
import {
  BULK_REVIEW_CONTRIBUTOR_AFFILIATION_SLOT_COUNT,
  BULK_REVIEW_WORKBOOK_SHEET_FUNDING,
} from "#shared/bulkReviewWorkbookManifest";
import { schemeUriForScheme } from "~/utils/poster_schema";
import IdentifierOrcidSearch from "~/components/identifier/IdentifierOrcidSearch.vue";
import IdentifierRorSearch from "~/components/identifier/IdentifierRorSearch.vue";

/**
 * Spreadsheet-style editor for batch poster metadata. Sheets and columns come
 * from the workbook manifest (schema-mapped), so it mirrors the old Excel
 * workbook without the download/upload round trip.
 */

const props = defineProps<{
  bulkJobId: string | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  saved: [posterIds: number[]];
  dirtyChange: [dirty: boolean];
}>();

type EditableRow = BulkReviewGridRow & { _key: string };

const ALL_POSTERS = "all";
const CREATORS_SHEET = "Creators";
const AFFILIATION_SLOT_PATTERN = /^contributor_affiliation_(\d+)_(name|ror)$/;
const MAX_AFFILIATION_SLOTS = BULK_REVIEW_CONTRIBUTOR_AFFILIATION_SLOT_COUNT;

function cellChoices(fillKey: string): readonly string[] | undefined {
  return bulkReviewGridChoicesForFillKey(fillKey);
}

const toast = useToast();
const loading = ref(false);
const saving = ref(false);
const loadError = ref<string | null>(null);
/** A validation issue tagged with the grid tab (or other area) where it is fixed. */
type GridValidationIssue = BulkImportValidationIssue & {
  sheet?: string;
  posterId?: string;
};

const saveIssues = ref<GridValidationIssue[]>([]);
const validationModalOpen = ref(false);
const validationModalIssues = ref<GridValidationIssue[]>([]);
const validationModalMode = ref<"inform" | "continue">("inform");
let validationModalResolver: ((choice: "dismiss" | "continue") => void) | null =
  null;

const grid = ref<BulkReviewMetadataGrid | null>(null);
const sheetRows = ref<Record<string, EditableRow[]>>({});
const savedSnapshot = ref("");
const activeSheet = ref<string>("");
const posterFilter = ref<string>(ALL_POSTERS);
const extraAffiliationSlots = ref(0);
const gridRoot = ref<HTMLElement | null>(null);

let keySeq = 0;
function withKey(row: BulkReviewGridRow): EditableRow {
  keySeq += 1;
  return { ...row, _key: `r${keySeq}` };
}

function stripKeys(rows: EditableRow[]): BulkReviewGridRow[] {
  return rows.map(({ _key, ...rest }) => rest);
}

/** Each poster's rows on every tab, serialized, so a save can send only changed posters. */
function posterSnapshots(): Map<string, string> {
  const byPoster = new Map<string, Record<string, BulkReviewGridRow[]>>();
  for (const [name, rows] of Object.entries(sheetRows.value)) {
    for (const row of stripKeys(rows)) {
      const id = String(row.poster_id ?? "");
      const sheets = byPoster.get(id) ?? {};
      (sheets[name] ??= []).push(row);
      byPoster.set(id, sheets);
    }
  }

  return new Map(
    [...byPoster].map(([id, sheets]) => [id, JSON.stringify(sheets)]),
  );
}

/** Snapshots from the last load; a poster is saved only if its rows differ. */
const savedPosterSnapshots = ref(new Map<string, string>());

function changedPosterIds(): Set<string> {
  const current = posterSnapshots();
  const saved = savedPosterSnapshots.value;
  const changed = new Set<string>();
  for (const id of new Set([...current.keys(), ...saved.keys()])) {
    if (current.get(id) !== saved.get(id)) changed.add(id);
  }

  return changed;
}

function snapshot(): string {
  const out: Record<string, BulkReviewGridRow[]> = {};
  for (const [name, rows] of Object.entries(sheetRows.value)) {
    out[name] = stripKeys(rows);
  }
  return JSON.stringify(out);
}

/**
 * Set by edit actions (cell input, add/remove/move rows, paste) instead of
 * re-serializing every row of every tab on each keystroke, which made typing
 * slow for large batches. Cleared on load, save (reload) and discard.
 */
const dirty = ref(false);

function markDirty() {
  if (!dirty.value) dirty.value = true;
}

function onCellInput(row: BulkReviewGridRow, fillKey: string, value: string) {
  row[fillKey] = value;
  markDirty();
}

// ---------------------------------------------------------------------------
// ORCID / ROR lookup: the single-poster search drawers, opened from a cell.
// Each lookup fills the same fields the single-poster editor does.
// ---------------------------------------------------------------------------

type CellLookup =
  | {
      kind: "orcid";
      row: BulkReviewGridRow;
      idKey: string;
      givenName: string;
      familyName: string;
      affiliations: string[];
    }
  | {
      kind: "ror";
      row: BulkReviewGridRow;
      idKey: string;
      nameKey: string;
      query: string;
      nameLabel: string;
    };

const activeLookup = ref<CellLookup | null>(null);

function rowAffiliationNames(row: BulkReviewGridRow): string[] {
  const names: string[] = [];
  for (let slot = 1; slot <= MAX_AFFILIATION_SLOTS; slot++) {
    const name = (row[`contributor_affiliation_${slot}_name`] ?? "").trim();
    if (name) names.push(name);
  }

  return names;
}

/** Which lookup a cell offers, or null; built on demand when the button is clicked. */
function cellLookup(
  column: BulkReviewGridColumn,
  row: BulkReviewGridRow,
): CellLookup | null {
  const sheetName = currentSheet.value?.name;
  const value = (key: string) => (row[key] ?? "").trim();

  if (sheetName === CREATORS_SHEET && column.fillKey === "name_identifier") {
    if (row.name_type === "Organizational") {
      return {
        kind: "ror",
        row,
        idKey: "name_identifier",
        nameKey: "given_name",
        query: value("given_name"),
        nameLabel: "organization",
      };
    }

    return {
      kind: "orcid",
      row,
      idKey: "name_identifier",
      givenName: value("given_name"),
      familyName: value("family_name"),
      affiliations: rowAffiliationNames(row),
    };
  }

  const slot = affiliationSlot(column.fillKey);
  if (sheetName === CREATORS_SHEET && slot != null && column.fillKey.endsWith("_ror")) {
    const nameKey = `contributor_affiliation_${slot}_name`;

    return {
      kind: "ror",
      row,
      idKey: column.fillKey,
      nameKey,
      query: value(nameKey),
      nameLabel: "affiliation",
    };
  }

  // Like single-poster editing: only while the funder is empty or already ROR.
  if (
    sheetName === BULK_REVIEW_WORKBOOK_SHEET_FUNDING &&
    column.fillKey === "funder_identifier" &&
    (!value("funder_identifier_type") || value("funder_identifier_type") === "ROR")
  ) {
    return {
      kind: "ror",
      row,
      idKey: "funder_identifier",
      nameKey: "funder_name",
      query: value("funder_name"),
      nameLabel: "funder",
    };
  }

  return null;
}

function cellLookupKind(column: BulkReviewGridColumn, row: BulkReviewGridRow) {
  return cellLookup(column, row)?.kind ?? null;
}

/** The search needs something to search for, as in single-poster editing. */
function canRunCellLookup(column: BulkReviewGridColumn, row: BulkReviewGridRow) {
  const lookup = cellLookup(column, row);
  if (!lookup) return false;

  return lookup.kind === "orcid" ? Boolean(lookup.givenName) : Boolean(lookup.query);
}

function openCellLookup(row: BulkReviewGridRow, column: BulkReviewGridColumn) {
  activeLookup.value = cellLookup(column, row);
}

function onOrcidLookupSelect(orcidUrl: string) {
  const lookup = activeLookup.value;
  if (lookup?.kind !== "orcid") return;
  onCellInput(lookup.row, lookup.idKey, orcidUrl);
  activeLookup.value = null;
}

// ---------------------------------------------------------------------------
// ORCID auto-fill (Creators tab): fill an ORCID only when exactly one ORCID
// record has the same given and family name within the creator's affiliations.
// ---------------------------------------------------------------------------

const orcidAutoFill = reactive({ running: false, done: 0, total: 0 });
const ORCID_AUTO_FILL_CONCURRENCY = 4;

type OrcidSearchResult = {
  orcidId: string;
  givenName: string;
  familyName: string;
};

/** Case-, accent- and punctuation-insensitive name for exact matching. */
function normalizePersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Visible person creators with a name and affiliation but no ORCID yet. */
function orcidAutoFillCandidates(): BulkReviewGridRow[] {
  if (currentSheet.value?.name !== CREATORS_SHEET) return [];

  return visibleRows.value
    .map(({ row }) => row)
    .filter(
      (row) =>
        row.name_type !== "Organizational" &&
        !(row.name_identifier ?? "").trim() &&
        (row.given_name ?? "").trim() &&
        (row.family_name ?? "").trim() &&
        rowAffiliationNames(row).length > 0,
    );
}

async function autoFillOrcids() {
  if (orcidAutoFill.running) return;

  const candidates = orcidAutoFillCandidates();
  if (candidates.length === 0) {
    toast.add({
      title: "Nothing to auto-fill",
      description:
        "Auto-fill needs person creators with a given name, family name and affiliation, and no ORCID yet.",
      color: "info",
    });

    return;
  }

  // One search per distinct name + affiliations (the same person often
  // appears on several posters).
  const groups = new Map<string, BulkReviewGridRow[]>();
  for (const row of candidates) {
    const key = [
      normalizePersonName(row.given_name ?? ""),
      normalizePersonName(row.family_name ?? ""),
      rowAffiliationNames(row).join("; "),
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const queue = [...groups.values()];
  let filledRows = 0;
  let noMatch = 0;
  let ambiguous = 0;
  let failed = 0;

  orcidAutoFill.running = true;
  orcidAutoFill.done = 0;
  orcidAutoFill.total = queue.length;

  async function worker() {
    for (let rows = queue.shift(); rows; rows = queue.shift()) {
      const first = rows[0]!;
      const givenName = (first.given_name ?? "").trim();
      const familyName = (first.family_name ?? "").trim();
      try {
        const results = await $fetch<OrcidSearchResult[]>("/api/orcid/search", {
          query: {
            givenName,
            familyName,
            affiliation: rowAffiliationNames(first).join("; "),
          },
        });
        const exactIds = new Set(
          results
            .filter(
              (result) =>
                normalizePersonName(result.givenName) ===
                  normalizePersonName(givenName) &&
                normalizePersonName(result.familyName) ===
                  normalizePersonName(familyName),
            )
            .map((result) => result.orcidId),
        );

        if (exactIds.size === 1) {
          const orcidUrl = `https://orcid.org/${[...exactIds][0]}`;
          for (const row of rows) {
            // Skip a cell the user filled while the search ran.
            if ((row.name_identifier ?? "").trim()) continue;
            onCellInput(row, "name_identifier", orcidUrl);
            filledRows++;
          }
        } else if (exactIds.size === 0) {
          noMatch += rows.length;
        } else {
          ambiguous += rows.length;
        }
      } catch {
        failed += rows.length;
      } finally {
        orcidAutoFill.done++;
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: ORCID_AUTO_FILL_CONCURRENCY }, () => worker()),
    );
  } finally {
    orcidAutoFill.running = false;
  }

  const skipped = [
    noMatch && `${noMatch} with no exact match`,
    ambiguous && `${ambiguous} with more than one match`,
    failed && `${failed} that could not be searched`,
  ].filter(Boolean);

  toast.add({
    title:
      filledRows > 0
        ? `Filled ${filledRows} ORCID${filledRows === 1 ? "" : "s"}`
        : "No ORCIDs filled",
    description: [
      filledRows > 0 ? "Review them, then save." : "",
      skipped.length ? `Left empty: ${skipped.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    color: filledRows > 0 ? "success" : "info",
  });
}

/** Fill the ROR URL and replace the typed name with the registry's formal name. */
function onRorLookupSelect(rorUrl: string, displayName: string) {
  const lookup = activeLookup.value;
  if (lookup?.kind !== "ror") return;
  onCellInput(lookup.row, lookup.idKey, rorUrl);
  onCellInput(lookup.row, lookup.nameKey, displayName);
  if (lookup.idKey === "funder_identifier") {
    onCellInput(lookup.row, "funder_identifier_type", "ROR");
    onCellInput(lookup.row, "scheme_uri", schemeUriForScheme("ROR") ?? "");
  }
  activeLookup.value = null;
}
watch(dirty, (value) => emit("dirtyChange", value));

/**
 * True when the rows differ from what was loaded. `dirty` only says a cell was
 * edited (typing then undoing still sets it), so compare once before saving.
 */
function hasUnsavedChanges(): boolean {
  if (!dirty.value) return false;
  if (snapshot() !== savedSnapshot.value) return true;

  dirty.value = false;

  return false;
}

function fetchErrorDescription(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("data" in error && error.data && typeof error.data === "object") {
    const data = error.data as {
      message?: string;
      statusMessage?: string;
      data?: { issues?: BulkImportValidationIssue[] };
    };
    return data.statusMessage ?? data.message;
  }
  if (error instanceof Error) return error.message;
  return undefined;
}

function fetchErrorIssues(error: unknown): BulkImportValidationIssue[] {
  if (!error || typeof error !== "object" || !("data" in error)) return [];
  const data = (error as { data?: { data?: { issues?: unknown } } }).data;
  const issues = data?.data?.issues;
  return Array.isArray(issues) ? (issues as BulkImportValidationIssue[]) : [];
}

/**
 * @param options.refresh Reload after a save: skip the per-poster preparation the
 *   server does on first open (batch metadata apply, discover links).
 */
async function load(options: { refresh?: boolean } = {}) {
  if (!props.bulkJobId) return;
  loading.value = true;
  loadError.value = null;
  saveIssues.value = [];
  try {
    const data = await getBulkReviewMetadataGrid(props.bulkJobId, options);
    grid.value = data;
    const rows: Record<string, EditableRow[]> = {};
    for (const sheet of data.sheets) {
      rows[sheet.name] = sheet.rows.map(withKey);
    }
    applySheetPosterRanks(data, rows);
    sheetRows.value = rows;
    savedSnapshot.value = snapshot();
    savedPosterSnapshots.value = posterSnapshots();
    dirty.value = false;
    extraAffiliationSlots.value = 0;
    if (!data.sheets.some((sheet) => sheet.name === activeSheet.value)) {
      activeSheet.value = data.sheets[0]?.name ?? "";
    }
    if (
      posterFilter.value !== ALL_POSTERS &&
      !data.posters.some((p) => String(p.id) === posterFilter.value)
    ) {
      posterFilter.value = ALL_POSTERS;
    }
    // Tab warnings for required-field issues (also refreshed after each save).
    void refreshStrictTabIssues();
  } catch (error) {
    loadError.value =
      fetchErrorDescription(error) ?? "Could not load poster metadata.";
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.bulkJobId,
  () => load(),
  { immediate: true },
);


const currentSheet = computed<BulkReviewGridSheet | undefined>(() =>
  grid.value?.sheets.find((sheet) => sheet.name === activeSheet.value),
);

const posterById = computed(
  () => new Map((grid.value?.posters ?? []).map((p) => [String(p.id), p])),
);

const posterOrder = computed(
  () =>
    new Map((grid.value?.posters ?? []).map((p, index) => [String(p.id), index])),
);

const posterFilterOptions = computed(() => [
  { label: "All posters", value: ALL_POSTERS },
  ...(grid.value?.posters ?? []).map((poster) => ({
    label: posterDisplayName(String(poster.id)),
    value: String(poster.id),
  })),
]);

const addRowPosterOptions = computed(() =>
  (grid.value?.posters ?? []).map((poster) => ({
    label: posterDisplayName(String(poster.id)),
    onSelect: () => addRow(String(poster.id)),
  })),
);

/** File name identifies posters in a batch (titles may be empty or extracted). */
function posterDisplayName(posterId: string): string {
  const poster = posterById.value.get(posterId);
  if (!poster) return "Poster";
  return poster.fileName || poster.title?.trim() || `Poster ${poster.id}`;
}

const tabItems = computed(() =>
  (grid.value?.sheets ?? []).map((sheet) => ({
    label: sheet.name,
    value: sheet.name,
  })),
);

/** Rows of the active sheet that pass the poster filter, with their index in the full list. */
const visibleRows = computed(() => {
  const sheet = currentSheet.value;
  if (!sheet) return [];
  const rows = sheetRows.value[sheet.name] ?? [];
  return rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        posterFilter.value === ALL_POSTERS || row.poster_id === posterFilter.value,
    );
});


/** Label for "add a row" actions on the active tab. */
const addRowNoun = computed(() => {
  const sheet = currentSheet.value;
  if (!sheet) return "entry";
  if (sheet.rowNoun) return sheet.rowNoun;
  // Fallback for sheets without a rowNoun: singular of the tab name.
  const name = sheet.name.toLowerCase();
  return name.endsWith("s") ? name.slice(0, -1) : name;
});

function affiliationSlot(fillKey: string): number | null {
  const match = AFFILIATION_SLOT_PATTERN.exec(fillKey);
  return match ? Number(match[1]) : null;
}

/** Affiliation slots in use on the visible Creators rows. */
const usedAffiliationSlots = computed(() => {
  if (currentSheet.value?.name !== CREATORS_SHEET) return 0;
  let max = 0;
  for (const { row } of visibleRows.value) {
    for (let slot = MAX_AFFILIATION_SLOTS; slot > max; slot--) {
      if (
        row[`contributor_affiliation_${slot}_name`]?.trim() ||
        row[`contributor_affiliation_${slot}_ror`]?.trim()
      ) {
        max = slot;
        break;
      }
    }
  }
  return max;
});

const shownAffiliationSlots = computed(() =>
  Math.min(
    MAX_AFFILIATION_SLOTS,
    Math.max(1, usedAffiliationSlots.value + extraAffiliationSlots.value),
  ),
);

const editableColumns = computed<BulkReviewGridColumn[]>(() => {
  const sheet = currentSheet.value;
  if (!sheet) return [];
  const columns = sheet.columns.filter((column) => {
    if (column.system) return false;
    const slot = affiliationSlot(column.fillKey);
    return slot == null || slot <= shownAffiliationSlots.value;
  });

  // Creators: affiliations before ORCID, matching the lookup flow (find the
  // affiliation's ROR first, then ORCID searches within those affiliations).
  // Grid only; the workbook keeps the manifest order.
  if (sheet.name !== CREATORS_SHEET) return columns;
  const orcid = columns.find((column) => column.fillKey === "name_identifier");
  if (!orcid) return columns;
  const rest = columns.filter((column) => column !== orcid);
  let lastAffiliation = -1;
  rest.forEach((column, index) => {
    if (affiliationSlot(column.fillKey) != null) lastAffiliation = index;
  });
  if (lastAffiliation === -1) return columns;
  rest.splice(lastAffiliation + 1, 0, orcid);

  return rest;
});

const MAX_COLUMN_WIDTH_PX = 500;

function columnWidthPx(column: BulkReviewGridColumn): number {
  // Manifest widths are Excel character widths; long text wraps at 500px.
  // Never narrower than the header (+ room for the required mark and info
  // icon), so headers like "Funder identifier type" stay on one line.
  const chars = Math.max(column.width ?? 20, 12, column.header.length + 6);
  return Math.min(MAX_COLUMN_WIDTH_PX, Math.round(chars * 7.5));
}

/** Fill the cell; the column's own width (capped at 500px) comes from the header. */
function cellWidthStyle(column: BulkReviewGridColumn) {
  return { width: "100%", minWidth: `${columnWidthPx(column)}px` };
}

function isMissingRequired(
  column: BulkReviewGridColumn,
  row: BulkReviewGridRow,
) {
  const sheetName = currentSheet.value?.name;

  return sheetName ? cellMissingRequired(sheetName, column, row) : false;
}

/**
 * An empty row on a list sheet (creators, funding, identifiers, ...) is
 * dropped on save, so its required cells are not flagged.
 */
function isBlankRepeatableRow(sheetName: string, row: BulkReviewGridRow) {
  if (sheetName === CREATORS_SHEET) {
    return !row.given_name?.trim() && !row.family_name?.trim();
  }
  const sheet = grid.value?.sheets.find((item) => item.name === sheetName);
  if (!sheet?.repeatable) return false;

  return sheet.columns.every(
    (column) => column.system || !(row[column.fillKey] ?? "").trim(),
  );
}

function cellMissingRequired(
  sheetName: string,
  column: BulkReviewGridColumn,
  row: BulkReviewGridRow,
) {
  if (column.requirement !== "required") return false;
  if (
    sheetName === CREATORS_SHEET &&
    column.fillKey === "family_name" &&
    row.name_type === "Organizational"
  ) {
    return false;
  }
  if (isBlankRepeatableRow(sheetName, row)) return false;

  return !(row[column.fillKey] ?? "").trim();
}

function collectGridRequiredIssues(): GridValidationIssue[] {
  if (!grid.value) return [];
  const issues: GridValidationIssue[] = [];

  for (const sheet of grid.value.sheets) {
    const rows = sheetRows.value[sheet.name] ?? [];
    const editable = sheet.columns.filter((column) => !column.system);

    rows.forEach((editableRow, rowIndex) => {
      const row = stripKeys([editableRow])[0]!;
      const posterName = posterDisplayName(row.poster_id ?? "");

      for (const column of editable) {
        if (!cellMissingRequired(sheet.name, column, row)) continue;
        issues.push({
          code: "required_field",
          message: `${posterName}: ${column.header} is required.`,
          severity: "error",
          sheet: sheet.name,
          rowNumber: rowIndex + 1,
          field: column.fillKey,
          posterId: row.poster_id,
        });
      }
    });
  }

  return issues;
}

/** Validate every poster in one request (server runs the same strict-form check). */
async function collectStrictFormIssues(): Promise<GridValidationIssue[]> {
  if (!props.bulkJobId || (grid.value?.posters.length ?? 0) === 0) return [];

  try {
    const { posters } = await getBulkReviewMetadataValidation(props.bulkJobId);
    const issues: GridValidationIssue[] = [];
    for (const result of posters) {
      const label = posterDisplayName(String(result.posterId));
      for (const issue of result.issues) {
        const detail = strictIssueMessage(issue.path, issue.message);
        issues.push({
          code: "strict_form",
          message: `${label}: ${detail}`,
          severity: "error",
          sheet: sheetForSchemaPath(issue.path),
          field: fillKeyForSchemaPath(issue.path),
          posterId: String(result.posterId),
        });
      }
    }
    return issues;
  } catch {
    return [
      {
        code: "validation_failed",
        message: "Could not validate poster metadata. Try again.",
        severity: "error",
      },
    ];
  }
}

const CONFERENCE_GROUP = "Conference information";
const OTHER_GROUP = "Other details";

/** Map a strictFormSchema path (e.g. "creators.0.givenName") to its grid tab. */
function sheetForSchemaPath(path: string | undefined): string {
  const head = (path ?? "").split(".")[0] ?? "";
  switch (head) {
    case "title":
    case "description":
    case "subjects":
      return "About the Poster";
    case "creators":
      return CREATORS_SHEET;
    case "submissionAbstract":
    case "language":
    case "domain":
      return "Additional information";
    case "identifiers":
      return "Poster identifiers";
    case "relatedIdentifiers":
      return "Related resources";
    case "fundingReferences":
      return "Funding";
    case "posterContent":
      return (path ?? "").includes("submissionAbstract")
        ? "Additional information"
        : "Poster content";
    case "tableCaptions":
      return "Table captions";
    case "imageCaptions":
      return "Image captions";
    case "conference":
    case "dates":
      return CONFERENCE_GROUP;
    default:
      return OTHER_GROUP;
  }
}

/** Grid column for the last part of a strictFormSchema path, when there is one. */
const SCHEMA_FIELD_FILL_KEYS: Record<string, string> = {
  title: "title",
  description: "description",
  subjects: "keywords",
  givenName: "given_name",
  familyName: "family_name",
  identifier: "identifier",
  identifierType: "identifier_type",
  funderName: "funder_name",
  caption: "caption",
};

function fillKeyForSchemaPath(path: string | undefined): string | undefined {
  const parts = (path ?? "").split(".").filter((part) => !/^\d+$/.test(part));
  const leaf = parts[parts.length - 1] ?? "";
  return SCHEMA_FIELD_FILL_KEYS[leaf];
}

/**
 * Drop server issues the grid already reports for the same poster, tab and
 * column (the two checks word the same problem differently).
 */
function withoutGridDuplicates(
  strictIssues: GridValidationIssue[],
  gridIssues: GridValidationIssue[],
): GridValidationIssue[] {
  const reported = new Set(
    gridIssues.map((issue) => `${issue.posterId}|${issue.sheet}|${issue.field}`),
  );
  return strictIssues.filter(
    (issue) =>
      !issue.field ||
      !reported.has(`${issue.posterId}|${issue.sheet}|${issue.field}`),
  );
}

/** Server issues mention the sheet as: Row 3 on "Funding": … */
function sheetForIssue(issue: GridValidationIssue): string {
  if (issue.sheet) return issue.sheet;
  const match = /on "([^"]+)"/.exec(issue.message);
  return match?.[1] ?? OTHER_GROUP;
}

/** Group issues by tab, in tab order, then conference / other. */
function groupIssuesBySheet(list: GridValidationIssue[]) {
  const groups = new Map<string, GridValidationIssue[]>();
  for (const issue of list) {
    const sheet = sheetForIssue(issue);
    const list = groups.get(sheet) ?? [];
    list.push(issue);
    groups.set(sheet, list);
  }
  const tabOrder = (grid.value?.sheets ?? []).map((sheet) => sheet.name);
  const order = [...tabOrder, CONFERENCE_GROUP, OTHER_GROUP];
  const rank = (name: string) => {
    const index = order.indexOf(name);
    return index === -1 ? order.length : index;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([name, issues]) => ({
      name,
      issues,
      isTab: tabOrder.includes(name),
      hint:
        name === CONFERENCE_GROUP
          ? "Fix these on the conference information step."
          : name === OTHER_GROUP
            ? "Fix these in poster previews."
            : undefined,
    }));
}

const validationIssueGroups = computed(() =>
  groupIssuesBySheet(validationModalIssues.value),
);
const saveIssueGroups = computed(() => groupIssuesBySheet(saveIssues.value));

/**
 * Required-field issues (the ones "Fix metadata before publishing" lists),
 * checked against saved data when the grid loads and after every save.
 */
const strictTabIssues = ref<GridValidationIssue[]>([]);

async function refreshStrictTabIssues() {
  const issues = await collectStrictFormIssues();
  strictTabIssues.value = issues.filter((issue) => issue.code === "strict_form");
}

/**
 * Tabs that need attention: missing required cells (live), required-field
 * issues from the last check, or issues from the last save.
 */
const sheetsWithIssues = computed(
  () =>
    new Set([
      ...collectGridRequiredIssues().map((issue) => issue.sheet),
      ...strictTabIssues.value.map((issue) => issue.sheet),
      ...saveIssueGroups.value
        .filter((group) => group.isTab)
        .map((group) => group.name),
    ]),
);

// ---------------------------------------------------------------------------
// Opened tabs: every tab holds AI-extracted metadata, so tabs stay grey until
// opened, and Save and Continue asks before skipping unopened ones (like the
// single-poster editor's "Sections Not Reviewed" check). Remembered per batch
// in this browser.
// ---------------------------------------------------------------------------

const openedSheets = ref(new Set<string>());

function openedSheetsStorageKey() {
  return props.bulkJobId ? `bulk-review-opened-tabs:${props.bulkJobId}` : "";
}

function restoreOpenedSheets() {
  const key = openedSheetsStorageKey();
  if (!key) return;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(saved)) {
      openedSheets.value = new Set([
        ...openedSheets.value,
        ...saved.filter((name): name is string => typeof name === "string"),
      ]);
    }
  } catch {
    // Storage unavailable or corrupt: start with no opened tabs.
  }
}

function markSheetsOpened(names: string[]) {
  const next = new Set([...openedSheets.value, ...names.filter(Boolean)]);
  if (next.size === openedSheets.value.size) return;
  openedSheets.value = next;
  const key = openedSheetsStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify([...next]));
  } catch {
    // Not persisted; still tracked for this visit.
  }
}

onMounted(restoreOpenedSheets);
watch(activeSheet, (name) => markSheetsOpened([name]), { immediate: true });

function unopenedSheetNames(): string[] {
  return (grid.value?.sheets ?? [])
    .map((sheet) => sheet.name)
    .filter((name) => !openedSheets.value.has(name));
}

const unreviewedModalOpen = ref(false);
const unreviewedSheets = ref<string[]>([]);
let unreviewedModalResolver: ((choice: "review" | "continue") => void) | null =
  null;

function askAboutUnopenedSheets(names: string[]): Promise<"review" | "continue"> {
  unreviewedSheets.value = names;
  unreviewedModalOpen.value = true;

  return new Promise((resolve) => {
    unreviewedModalResolver = resolve;
  });
}

function closeUnreviewedModal(choice: "review" | "continue") {
  unreviewedModalOpen.value = false;
  unreviewedModalResolver?.(choice);
  unreviewedModalResolver = null;
}

/** "the Creators and Funding tabs" / "the Funding tab" */
const unreviewedSheetsLabel = computed(() => {
  const names = unreviewedSheets.value;
  const list =
    names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return `the ${list} ${names.length === 1 ? "tab" : "tabs"}`;
});

function goToIssueSheet(sheetName: string) {
  activeSheet.value = sheetName;
  if (validationModalOpen.value) closeValidationModal("dismiss");
}

function dedupeValidationIssues(
  issues: GridValidationIssue[],
): GridValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.severity}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function openValidationModal(
  issues: GridValidationIssue[],
  mode: "inform" | "continue",
): Promise<"dismiss" | "continue"> {
  validationModalIssues.value = issues;
  validationModalMode.value = mode;
  validationModalOpen.value = true;

  return new Promise((resolve) => {
    validationModalResolver = resolve;
  });
}

function closeValidationModal(choice: "dismiss" | "continue") {
  validationModalOpen.value = false;
  validationModalResolver?.(choice);
  validationModalResolver = null;
}

async function collectAllValidationIssues(options: {
  attemptSave: boolean;
}): Promise<{
  issues: GridValidationIssue[];
  savedPosterIds: number[];
  saveAttempted: boolean;
}> {
  const issues: GridValidationIssue[] = [];
  let savedPosterIds: number[] = [];
  let saveAttempted = false;

  // Everything saves as entered, even when it leaves a required field empty
  // (e.g. a deleted title); the issues below then say what still needs fixing.
  if (options.attemptSave && dirty.value) {
    saveAttempted = true;
    // Only posters whose rows changed; every tab is still sent (possibly
    // empty) so a poster's deleted rows clear on the server.
    const changed = changedPosterIds();
    const sheets: Record<string, BulkReviewGridRow[]> = {};
    for (const [name, rows] of Object.entries(sheetRows.value)) {
      sheets[name] = stripKeys(rows).filter((row) =>
        changed.has(String(row.poster_id ?? "")),
      );
    }

    try {
      const result = await saveBulkReviewMetadataGrid(props.bulkJobId!, { sheets });
      savedPosterIds = result.updatedPosterIds;
      issues.push(...result.issues.filter((issue) => issue.severity === "error"));
      await load({ refresh: true });
    } catch (error) {
      issues.push(...fetchErrorIssues(error));
    }
  }

  const gridIssues = collectGridRequiredIssues();
  issues.push(...gridIssues);

  const strictIssues = await collectStrictFormIssues();
  issues.push(...withoutGridDuplicates(strictIssues, gridIssues));

  return {
    issues: dedupeValidationIssues(issues.filter((issue) => issue.severity === "error")),
    savedPosterIds,
    saveAttempted,
  };
}

async function showValidationOutcome(
  issues: GridValidationIssue[],
  mode: "inform" | "continue",
  savedPosterIds: number[],
  saveAttempted: boolean,
): Promise<"dismiss" | "continue"> {
  saveIssues.value = issues;

  if (issues.length === 0) {
    if (saveAttempted) {
      toast.add({
        title: "Metadata saved",
        description:
          savedPosterIds.length === 1
            ? "Updated 1 poster."
            : `Updated ${savedPosterIds.length} poster(s).`,
        color: "success",
      });
      emit("saved", savedPosterIds);
    }
    return "continue";
  }

  if (saveAttempted && savedPosterIds.length > 0) {
    emit("saved", savedPosterIds);
  }

  return openValidationModal(issues, mode);
}

function blankRow(sheet: BulkReviewGridSheet, posterId: string): EditableRow {
  const row: BulkReviewGridRow = {};
  for (const column of sheet.columns) row[column.fillKey] = "";
  row.poster_id = posterId;
  if ("file_name" in row) {
    row.file_name = posterById.value.get(posterId)?.fileName ?? "";
  }
  if (sheet.name === CREATORS_SHEET) row.name_type = "Personal";
  return withKey(row);
}

/** Insert after the poster's last row, or at the poster's place in the tab order. */
/**
 * Per list tab, the order posters are shown in. Fixed when the grid first loads
 * for a job (posters with no rows first, then the rest in batch order) and kept
 * across saves, so adding a row never moves a poster.
 */
const sheetPosterRank = ref<Record<string, Map<string, number>>>({});
let rankedJobId: string | null = null;

function applySheetPosterRanks(
  data: BulkReviewMetadataGrid,
  rows: Record<string, EditableRow[]>,
) {
  const keep = rankedJobId === props.bulkJobId;
  const next: Record<string, Map<string, number>> = {};
  const batchIds = data.posters.map((poster) => String(poster.id));

  for (const sheet of data.sheets) {
    if (!sheet.repeatable) continue;
    const sheetList = rows[sheet.name] ?? [];
    let rank = keep ? sheetPosterRank.value[sheet.name] : undefined;

    if (rank) {
      rank = new Map(rank);
      for (const id of batchIds) {
        if (!rank.has(id)) rank.set(id, rank.size);
      }
    } else {
      const withRows = new Set(sheetList.map((row) => row.poster_id));
      const ordered = [
        ...batchIds.filter((id) => !withRows.has(id)),
        ...batchIds.filter((id) => withRows.has(id)),
      ];
      rank = new Map(ordered.map((id, index) => [id, index]));
    }
    next[sheet.name] = rank;

    // Stable sort keeps each poster's own row order.
    const ranked = rank;
    sheetList.sort(
      (a, b) =>
        (ranked.get(a.poster_id ?? "") ?? Number.MAX_SAFE_INTEGER) -
        (ranked.get(b.poster_id ?? "") ?? Number.MAX_SAFE_INTEGER),
    );
  }

  sheetPosterRank.value = next;
  rankedJobId = props.bulkJobId;
}

function posterRank(sheetName: string, posterId: string): number {
  const rank = sheetPosterRank.value[sheetName];
  if (rank) return rank.get(posterId) ?? Number.MAX_SAFE_INTEGER;
  return posterOrder.value.get(posterId) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Posters (passing the filter) with their visible rows, in display order.
 * Every other poster is `shaded`, all of its rows alike, so each poster
 * reads as one block.
 */
const displayGroups = computed(() => {
  const sheet = currentSheet.value;
  if (!sheet || !grid.value) return [];

  const entriesByPoster = new Map<
    string,
    Array<{ row: EditableRow; index: number; rowPos: number }>
  >();
  visibleRows.value.forEach(({ row, index }, rowPos) => {
    const id = row.poster_id ?? "";
    const list = entriesByPoster.get(id) ?? [];
    list.push({ row, index, rowPos });
    entriesByPoster.set(id, list);
  });

  return grid.value.posters
    .map((poster) => String(poster.id))
    .filter(
      (id) => posterFilter.value === ALL_POSTERS || posterFilter.value === id,
    )
    .sort((a, b) => posterRank(sheet.name, a) - posterRank(sheet.name, b))
    .map((posterId) => ({
      posterId,
      entries: entriesByPoster.get(posterId) ?? [],
    }))
    .filter((group) => group.entries.length > 0 || sheet.repeatable)
    .map((group, groupIndex) => ({ ...group, shaded: groupIndex % 2 === 1 }));
});

function insertionIndex(rows: EditableRow[], posterId: string): number {
  let lastIndex = -1;
  rows.forEach((row, index) => {
    if (row.poster_id === posterId) lastIndex = index;
  });
  if (lastIndex >= 0) return lastIndex + 1;
  const sheetName = currentSheet.value?.name ?? "";
  const order = posterRank(sheetName, posterId);
  const next = rows.findIndex(
    (row) => posterRank(sheetName, row.poster_id ?? "") > order,
  );
  return next === -1 ? rows.length : next;
}

function addRow(posterId: string) {
  const sheet = currentSheet.value;
  if (!sheet?.repeatable) return;
  const rows = sheetRows.value[sheet.name] ?? [];
  const row = blankRow(sheet, posterId);
  rows.splice(insertionIndex(rows, posterId), 0, row);
  markDirty();
  nextTick(() => focusRowKey(row._key));
}

function removeRow(index: number) {
  const sheet = currentSheet.value;
  if (!sheet?.repeatable) return;
  sheetRows.value[sheet.name]?.splice(index, 1);
  markDirty();
}

/** Tabs where row order is not meaningful to users: no move up/down buttons. */
const SHEETS_WITHOUT_REORDER = new Set([
  "Poster content",
  "Table captions",
  "Image captions",
]);

const showReorderButtons = computed(
  () => !SHEETS_WITHOUT_REORDER.has(currentSheet.value?.name ?? ""),
);

/** Move within the same poster's rows (row order is the list order). */
function moveRow(index: number, direction: -1 | 1) {
  const sheet = currentSheet.value;
  if (!sheet?.repeatable) return;
  const rows = sheetRows.value[sheet.name] ?? [];
  const row = rows[index];
  if (!row) return;
  let target = index + direction;
  while (target >= 0 && target < rows.length && rows[target]?.poster_id !== row.poster_id) {
    target += direction;
  }
  if (target < 0 || target >= rows.length) return;
  rows.splice(index, 1);
  rows.splice(target, 0, row);
  markDirty();
}

/**
 * For each row index on the active tab: is there a row for the same poster
 * above / below it. Computed once when rows are added, removed or reordered
 * (it only reads poster_id, so typing doesn't recompute it).
 */
const moveAvailability = computed(() => {
  const sheet = currentSheet.value;
  const rows = sheet ? (sheetRows.value[sheet.name] ?? []) : [];
  const up = new Array<boolean>(rows.length).fill(false);
  const down = new Array<boolean>(rows.length).fill(false);
  const lastIndexByPoster = new Map<string, number>();
  rows.forEach((row, index) => {
    const id = row.poster_id ?? "";
    const previous = lastIndexByPoster.get(id);
    if (previous != null) {
      up[index] = true;
      down[previous] = true;
    }
    lastIndexByPoster.set(id, index);
  });
  return { up, down };
});

function canMove(index: number, direction: -1 | 1): boolean {
  const { up, down } = moveAvailability.value;
  return Boolean(direction === -1 ? up[index] : down[index]);
}

function isFirstRowOfPoster(visibleIndex: number): boolean {
  if (visibleIndex === 0) return true;
  const prev = visibleRows.value[visibleIndex - 1];
  const current = visibleRows.value[visibleIndex];
  return prev?.row.poster_id !== current?.row.poster_id;
}

function isLastRowOfPoster(visibleIndex: number): boolean {
  const rows = visibleRows.value;
  if (visibleIndex >= rows.length - 1) return true;
  const next = rows[visibleIndex + 1];
  const current = rows[visibleIndex];
  return next?.row.poster_id !== current?.row.poster_id;
}

const POSTER_COLUMN_WIDTH_PX = 320;
const { width: gridViewportWidth } = useElementSize(gridRoot);

/**
 * Full screen pins this component over the window (same elements, so the
 * toolbar, tabs and save keep working) and stops the page behind scrolling.
 */
const fullScreen = ref(false);
const pageBody = ref<HTMLElement | null>(null);
const pageScrollLocked = useScrollLock(pageBody);

onMounted(() => {
  pageBody.value = document.body;
});

watch(fullScreen, (on) => {
  pageScrollLocked.value = on;
});

onBeforeUnmount(() => {
  pageScrollLocked.value = false;
});

// Esc leaves full screen, unless it is closing the issues dialog.
onKeyStroke("Escape", () => {
  if (fullScreen.value && !validationModalOpen.value) fullScreen.value = false;
});

/**
 * Full-width add buttons span the whole (wide) table; pin their label to the
 * visible part of the scroll area so it stays readable while scrolling sideways.
 */
function addButtonLabelStyle(leftOffsetPx: number) {
  const width = Math.max(160, gridViewportWidth.value - leftOffsetPx - 8);
  return { left: `${leftOffsetPx}px`, width: `${width}px`, maxWidth: "100%" };
}

// Rows are tinted with the primary colour on hover. It is mixed into the page
// background (not transparent) so the sticky poster column stays opaque.
const POSTER_NAME_COLUMN_BASE_CLASS =
  "border-default group-hover:bg-[color-mix(in_oklab,var(--ui-primary)_12%,var(--ui-bg))] sticky left-0 z-10 max-w-[320px] w-[320px] border-r border-b px-2 py-1.5 text-left align-top font-normal shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]";

/** The sticky poster column needs an opaque background, matching its row's stripe. */
function posterNameColumnClass(shaded: boolean) {
  return `${shaded ? "bg-elevated" : "bg-default"} ${POSTER_NAME_COLUMN_BASE_CLASS}`;
}

const tableBodyColumnCount = computed(() => {
  const sheet = currentSheet.value;
  if (!sheet) return 1;
  return 1 + editableColumns.value.length + (sheet.repeatable ? 1 : 0);
});

/**
 * Rows grow to their tallest cell, so a short field only fills the top of its
 * cell. Clicking the empty part of a cell focuses its field (caret at the end).
 */
function onCellAreaMouseDown(event: MouseEvent) {
  const cell = event.currentTarget as HTMLElement;
  if (event.target !== cell) return;
  const field = cell.querySelector<HTMLElement>("[data-cell]");
  if (!field) return;
  event.preventDefault();
  field.focus();
  if (field instanceof HTMLTextAreaElement) {
    const end = field.value.length;
    field.setSelectionRange(end, end);
  }
}

/* ---------- Keyboard navigation and multi-cell paste ---------- */

function cellElement(rowPos: number, colPos: number): HTMLElement | null {
  return (
    gridRoot.value?.querySelector<HTMLElement>(
      `[data-cell="${rowPos}:${colPos}"]`,
    ) ?? null
  );
}

function focusCell(rowPos: number, colPos: number) {
  const el = cellElement(rowPos, colPos);
  if (el) {
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select();
    }
  }
}

function focusRowKey(key: string) {
  const rowPos = visibleRows.value.findIndex(({ row }) => row._key === key);
  if (rowPos >= 0) focusCell(rowPos, 0);
}

function onCellKeydown(
  event: KeyboardEvent,
  rowPos: number,
  colPos: number,
  multiline = false,
) {
  // Short fields wrap visually but behave like single-line inputs.
  const isTextarea = multiline;

  if (event.key === "Enter" && !(isTextarea && event.shiftKey)) {
    if (isTextarea && event.altKey) return;
    event.preventDefault();
    focusCell(rowPos + (event.shiftKey ? -1 : 1), colPos);
    return;
  }

  // Arrow keys move between cells; in multi-line cells only with Ctrl/Cmd.
  const modifier = event.ctrlKey || event.metaKey;
  if (isTextarea && !modifier) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusCell(rowPos + 1, colPos);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    focusCell(rowPos - 1, colPos);
  } else if (modifier && event.key === "ArrowRight") {
    event.preventDefault();
    focusCell(rowPos, colPos + 1);
  } else if (modifier && event.key === "ArrowLeft") {
    event.preventDefault();
    focusCell(rowPos, colPos - 1);
  }
}

/** Parse clipboard text copied from Excel / Sheets (TSV with quoted cells). */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function onCellPaste(event: ClipboardEvent, rowPos: number, colPos: number) {
  const text = event.clipboardData?.getData("text/plain") ?? "";
  if (!text.includes("\t") && !/\n./.test(text.trimEnd())) return;

  const block = parseTsv(text);
  if (block.length <= 1 && (block[0]?.length ?? 0) <= 1) return;
  event.preventDefault();

  const sheet = currentSheet.value;
  if (!sheet) return;
  const columns = editableColumns.value;
  let pastedRows = 0;

  block.forEach((values, r) => {
    let entry = visibleRows.value[rowPos + r];
    if (!entry && sheet.repeatable) {
      // Extend the list for the same poster as the last pasted-into row.
      const anchor = visibleRows.value[rowPos + r - 1]?.row;
      if (!anchor?.poster_id) return;
      addRow(anchor.poster_id);
      entry = visibleRows.value[rowPos + r];
    }
    if (!entry) return;
    values.forEach((value, c) => {
      const column = columns[colPos + c];
      if (!column) return;
      entry.row[column.fillKey] = value.trim();
      markDirty();
    });
    pastedRows += 1;
  });

  if (pastedRows < block.length) {
    toast.add({
      title: "Paste truncated",
      description: `Pasted ${pastedRows} of ${block.length} rows (poster rows on this sheet are fixed).`,
      color: "warning",
    });
  }
}

/* ---------- Save / reset ---------- */

function resetChanges() {
  if (!savedSnapshot.value) return;
  const parsed = JSON.parse(savedSnapshot.value) as Record<string, BulkReviewGridRow[]>;
  const rows: Record<string, EditableRow[]> = {};
  for (const [name, list] of Object.entries(parsed)) rows[name] = list.map(withKey);
  sheetRows.value = rows;
  saveIssues.value = [];
  dirty.value = false;
}

async function save(): Promise<boolean> {
  if (!props.bulkJobId || saving.value || !grid.value) return false;
  saving.value = true;
  saveIssues.value = [];

  try {
    const { issues, savedPosterIds, saveAttempted } = await collectAllValidationIssues({
      attemptSave: hasUnsavedChanges(),
    });
    await showValidationOutcome(issues, "inform", savedPosterIds, saveAttempted);
    return issues.length === 0;
  } finally {
    saving.value = false;
  }
}

/** Save pending edits, validate, and optionally let the user continue to poster previews anyway. */
async function prepareStepTransition(): Promise<boolean> {
  if (!props.bulkJobId || saving.value || !grid.value) return true;

  // Like the single-poster editor: ask before skipping unreviewed tabs.
  const unopened = unopenedSheetNames();
  if (unopened.length > 0) {
    const choice = await askAboutUnopenedSheets(unopened);
    if (choice === "review") {
      activeSheet.value = unopened[0]!;

      return false;
    }
    markSheetsOpened(unopened);
  }

  saving.value = true;
  saveIssues.value = [];

  try {
    const { issues, savedPosterIds, saveAttempted } = await collectAllValidationIssues({
      attemptSave: hasUnsavedChanges(),
    });

    if (issues.length === 0) {
      if (saveAttempted) {
        toast.add({
          title: "Metadata saved",
          description:
            savedPosterIds.length === 1
              ? "Updated 1 poster."
              : `Updated ${savedPosterIds.length} poster(s).`,
          color: "success",
        });
        emit("saved", savedPosterIds);
      }
      return true;
    }

    if (saveAttempted && savedPosterIds.length > 0) {
      emit("saved", savedPosterIds);
    }

    saveIssues.value = issues;
    const choice = await openValidationModal(issues, "continue");
    return choice === "continue";
  } finally {
    saving.value = false;
  }
}

defineExpose({
  reload: load,
  save,
  discard: resetChanges,
  prepareStepTransition,
  dirty,
  saving,
});

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}

onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));
</script>

<template>
  <div
    class="space-y-4"
    :class="{
      'bg-default fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6': fullScreen,
    }"
  >
    <div v-if="loading && !grid" class="flex items-center gap-2 py-6" aria-busy="true">
      <UIcon name="i-lucide-loader-circle" class="text-primary size-5 animate-spin" />
      <span class="text-muted text-sm">Loading poster metadata…</span>
    </div>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Could not load metadata"
      :description="loadError"
      :actions="[{ label: 'Retry', onClick: () => load() }]"
    />

    <template v-else-if="grid">
      <!-- Toolbar -->
      <div class="flex flex-wrap items-center gap-3">
        <USelectMenu
          v-model="posterFilter"
          :items="posterFilterOptions"
          value-key="value"
          label-key="label"
          searchable
          icon="i-lucide-filter"
          class="w-full max-w-sm"
          aria-label="Show rows for poster"
        />

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <UBadge v-if="dirty" color="warning" variant="subtle" label="Unsaved changes" />
          <UButton
            color="neutral"
            variant="outline"
            :icon="fullScreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
            :label="fullScreen ? 'Exit full screen' : 'Full screen'"
            :aria-pressed="fullScreen"
            @click="fullScreen = !fullScreen"
          />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-rotate-ccw"
            label="Discard changes"
            :disabled="!dirty || saving"
            @click="resetChanges"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-save"
            label="Save draft"
            :loading="saving"
            :disabled="!dirty || disabled"
            @click="save()"
          />
        </div>
      </div>

      <div class="min-w-0 overflow-x-auto">
        <UTabs
          v-model="activeSheet"
          :items="tabItems"
          :content="false"
          class="w-max min-w-full"
          :ui="{
            list: 'inline-flex w-max flex-nowrap',
            trigger: 'shrink-0 whitespace-nowrap',
            label: 'whitespace-nowrap',
          }"
        >
          <!-- Grey until opened: every tab holds AI-extracted metadata to review. -->
          <template #default="{ item }">
            <span
              :class="{
                'text-dimmed italic': !openedSheets.has(String(item.value)),
              }"
              :title="
                openedSheets.has(String(item.value))
                  ? undefined
                  : 'Not opened yet: review this AI-extracted metadata'
              "
            >
              {{ item.label }}
            </span>
          </template>
          <template #trailing="{ item }">
            <UTooltip
              v-if="sheetsWithIssues.has(String(item.value))"
              text="Has required fields to fix"
            >
              <UIcon
                name="i-lucide-triangle-alert"
                class="text-warning size-4 shrink-0"
                aria-label="Has required fields to fix"
              />
            </UTooltip>
          </template>
        </UTabs>
      </div>

      <div v-if="currentSheet" class="space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <p class="text-muted max-w-3xl text-sm">{{ currentSheet.description }}</p>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-if="currentSheet.name === CREATORS_SHEET && shownAffiliationSlots < MAX_AFFILIATION_SLOTS"
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-columns-3"
              label="Add affiliation column"
              @click="extraAffiliationSlots += 1"
            />
            <template v-if="currentSheet.repeatable">
              <UButton
                v-if="posterFilter !== ALL_POSTERS"
                size="sm"
                color="primary"
                variant="outline"
                icon="i-lucide-plus"
                :label="`Add ${addRowNoun}`"
                :disabled="disabled"
                @click="addRow(posterFilter)"
              />
              <UDropdownMenu
                v-else
                :items="addRowPosterOptions"
                :content="{ align: 'end' }"
                :ui="{ content: 'max-h-80 overflow-y-auto' }"
              >
                <UButton
                  size="sm"
                  color="primary"
                  variant="outline"
                  icon="i-lucide-plus"
                  trailing-icon="i-lucide-chevron-down"
                  :label="`Add ${addRowNoun} to poster`"
                  :disabled="disabled"
                />
              </UDropdownMenu>
            </template>
          </div>
        </div>

        <div
          class="border-default min-w-0 overflow-hidden rounded-lg border"
          :class="{ 'pointer-events-none opacity-60': disabled || saving }"
        >
          <div
            ref="gridRoot"
            class="min-w-0 overflow-x-auto overflow-y-auto overscroll-x-contain"
            :class="fullScreen ? 'max-h-[calc(100dvh-14rem)]' : 'max-h-[65vh]'"
          >
            <table class="w-max border-separate border-spacing-0 text-sm">
            <thead class="bg-elevated sticky top-0 z-20">
              <tr>
                <th
                  class="bg-elevated border-default sticky left-0 z-30 max-w-[320px] w-[320px] border-r border-b px-2 py-2 text-left font-semibold shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                >
                  Poster
                </th>
                <th
                  v-if="currentSheet.repeatable"
                  class="bg-elevated border-default sticky left-[320px] z-30 w-px border-r border-b px-1 py-2"
                >
                  <span class="sr-only">Row actions</span>
                </th>
                <th
                  v-for="column in editableColumns"
                  :key="column.fillKey"
                  class="border-default border-r border-b px-2 py-2 text-left align-top font-semibold"
                  :style="{
                    width: `${columnWidthPx(column)}px`,
                    minWidth: `${columnWidthPx(column)}px`,
                    maxWidth: `${MAX_COLUMN_WIDTH_PX}px`,
                  }"
                >
                  <span class="flex items-center gap-1 whitespace-nowrap">
                    {{ column.header }}
                    <span v-if="column.requirement === 'required'" class="text-error" aria-label="required">*</span>
                    <!-- Help text only on the info icon, not the whole header. -->
                    <UTooltip
                      v-if="column.instruction || column.hint"
                      :text="column.instruction || column.hint"
                      :content="{ side: 'top' }"
                      :ui="{
                        content: 'h-auto max-w-xs py-1.5',
                        text: 'whitespace-normal',
                      }"
                    >
                      <UIcon
                        name="i-lucide-info"
                        class="text-dimmed hover:text-default size-3.5 cursor-help"
                        tabindex="0"
                        :aria-label="column.instruction || column.hint"
                      />
                    </UTooltip>
                    <UTooltip
                      v-if="
                        currentSheet.name === CREATORS_SHEET &&
                        column.fillKey === 'name_identifier'
                      "
                      text="Fill ORCIDs that have exactly one match for the creator's name and affiliation"
                    >
                      <UButton
                        size="xs"
                        color="primary"
                        variant="soft"
                        icon="i-lucide-wand-sparkles"
                        class="mr-auto ml-1.5 font-normal"
                        :label="
                          orcidAutoFill.running
                            ? `${orcidAutoFill.done}/${orcidAutoFill.total}`
                            : 'Auto-fill'
                        "
                        :loading="orcidAutoFill.running"
                        :disabled="disabled || saving"
                        @click="autoFillOrcids"
                      />
                    </UTooltip>
                  </span>
                </th>
              </tr>
            </thead>

            <tbody>
              <template
                v-for="group in displayGroups"
                :key="group.posterId"
              >
              <tr
                v-if="group.entries.length === 0"
                class="group"
              >
                <th scope="row" :class="posterNameColumnClass(group.shaded)">
                  <span
                    class="block text-sm font-normal [overflow-wrap:anywhere]"
                  >
                    {{ posterDisplayName(group.posterId) }}
                  </span>
                </th>
                <td
                  :colspan="tableBodyColumnCount - 1"
                  class="border-default border-b px-2 py-1 align-middle"
                  :class="group.shaded ? 'bg-elevated' : 'bg-default'"
                >
                  <button
                    type="button"
                    class="text-primary border-primary/50 hover:border-primary hover:bg-primary/10 block w-full rounded-md border py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="disabled || saving"
                    @click="addRow(group.posterId)"
                  >
                    <!-- Label stays centred in the visible area while scrolling sideways. -->
                    <span
                      class="sticky flex items-center justify-center gap-1.5"
                      :style="addButtonLabelStyle(POSTER_COLUMN_WIDTH_PX + 8)"
                    >
                      <UIcon name="i-lucide-plus" class="size-3.5 shrink-0 opacity-70" />
                      <span>Add {{ addRowNoun }}</span>
                    </span>
                  </button>
                </td>
              </tr>

              <template
                v-for="{ row, index, rowPos } in group.entries"
                :key="row._key"
              >
              <BulkImportMetadataGridRow
                :row="row"
                :row-pos="rowPos"
                :index="index"
                :columns="editableColumns"
                :poster-name="posterDisplayName(row.poster_id ?? '')"
                :first-of-poster="isFirstRowOfPoster(rowPos)"
                :repeatable="currentSheet.repeatable"
                :show-reorder="showReorderButtons"
                :can-move-up="canMove(index, -1)"
                :can-move-down="canMove(index, 1)"
                :poster-name-class="posterNameColumnClass(group.shaded)"
                :cell-choices="cellChoices"
                :choice-label="bulkReviewGridChoiceLabel"
                :shaded="group.shaded"
                :cell-style="cellWidthStyle"
                :is-missing-required="isMissingRequired"
                :lookup-kind="cellLookupKind"
                :can-lookup="canRunCellLookup"
                @cell-input="onCellInput"
                @lookup="openCellLookup"
                @cell-keydown="onCellKeydown"
                @cell-paste="onCellPaste"
                @cell-area-mouse-down="onCellAreaMouseDown"
                @move="moveRow"
                @remove="removeRow"
              />
              <tr
                v-if="
                  currentSheet.repeatable &&
                  isLastRowOfPoster(rowPos) &&
                  !disabled &&
                  !saving
                "
              >
                <td
                  :colspan="tableBodyColumnCount"
                  class="border-default border-b px-2 py-1"
                  :class="group.shaded ? 'bg-elevated' : 'bg-default'"
                >
                  <button
                    type="button"
                    class="text-primary border-primary/50 hover:border-primary hover:bg-primary/10 block w-full rounded-md border py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    :aria-label="`Add ${addRowNoun} to ${posterDisplayName(row.poster_id ?? '')}`"
                    @click="addRow(row.poster_id ?? '')"
                  >
                    <span
                      class="sticky flex items-center justify-center gap-1.5"
                      :style="addButtonLabelStyle(8)"
                    >
                      <UIcon name="i-lucide-plus" class="size-3.5 shrink-0 opacity-70" />
                      <span>Add {{ addRowNoun }}</span>
                    </span>
                  </button>
                </td>
              </tr>
              </template>
              </template>
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <UAlert
        v-if="saveIssues.length"
        :color="saveIssues.some((i) => i.severity === 'error') ? 'error' : 'warning'"
        variant="subtle"
        icon="i-lucide-list-checks"
        title="Review these issues"
      >
        <template #description>
          <p class="text-muted mb-2 text-xs">
            {{ saveIssues.length }} issue{{ saveIssues.length === 1 ? "" : "s" }}
          </p>
          <div
            class="border-default max-h-[min(16rem,40vh)] overflow-y-auto overscroll-y-contain rounded-md border p-3"
          >
            <section
              v-for="group in saveIssueGroups"
              :key="group.name"
              class="border-default not-last:mb-3 not-last:border-b not-last:pb-3"
            >
              <div class="mb-1.5 flex items-center justify-between gap-2">
                <h4 class="flex items-center gap-2 text-sm font-semibold">
                  {{ group.name }}
                  <UBadge
                    color="error"
                    variant="subtle"
                    size="sm"
                    :label="String(group.issues.length)"
                  />
                </h4>
                <UButton
                  v-if="group.isTab && group.name !== activeSheet"
                  size="xs"
                  color="primary"
                  variant="soft"
                  trailing-icon="i-lucide-arrow-right"
                  :label="`Go to ${group.name}`"
                  class="shrink-0"
                  @click="goToIssueSheet(group.name)"
                />
              </div>
              <p v-if="group.hint" class="text-muted mb-1.5 text-xs">
                {{ group.hint }}
              </p>
              <ul class="list-disc space-y-1 pl-4 text-sm">
                <li v-for="(issue, i) in group.issues" :key="i">
                  {{ issue.message }}
                </li>
              </ul>
            </section>
          </div>
        </template>
      </UAlert>
    </template>

    <UModal
      v-model:open="validationModalOpen"
      class="max-w-xl"
      :title="
        validationModalMode === 'continue'
          ? 'Fix metadata before publishing'
          : 'Metadata needs attention'
      "
      @update:open="(open) => !open && closeValidationModal('dismiss')"
    >
      <template #body>
        <p class="text-muted text-sm">
          <template v-if="validationModalMode === 'continue'">
            You can open poster previews to edit each poster, but you must fix
            these issues before submitting the batch.
          </template>
          <template v-else>
            Correct the issues below in the grid or use poster previews after
            you continue.
          </template>
        </p>
        <p class="text-muted mt-3 mb-2 text-xs">
          {{ validationModalIssues.length }} issue{{
            validationModalIssues.length === 1 ? "" : "s"
          }}
        </p>
        <div
          class="border-default max-h-[min(24rem,55vh)] overflow-y-auto overscroll-y-contain rounded-md border p-3"
          tabindex="0"
          role="region"
          aria-label="Validation issues"
        >
          <section
            v-for="group in validationIssueGroups"
            :key="group.name"
            class="border-default not-last:mb-3 not-last:border-b not-last:pb-3"
          >
            <div class="mb-1.5 flex items-center justify-between gap-2">
              <h4 class="flex items-center gap-2 text-sm font-semibold">
                {{ group.name }}
                <UBadge
                  color="error"
                  variant="subtle"
                  size="sm"
                  :label="String(group.issues.length)"
                />
              </h4>
              <UButton
                v-if="group.isTab"
                size="xs"
                color="primary"
                variant="soft"
                trailing-icon="i-lucide-arrow-right"
                :label="`Go to ${group.name}`"
                class="shrink-0"
                @click="goToIssueSheet(group.name)"
              />
            </div>
            <p v-if="group.hint" class="text-muted mb-1.5 text-xs">
              {{ group.hint }}
            </p>
            <ul class="list-disc space-y-1 pl-4 text-sm">
              <li v-for="(issue, index) in group.issues" :key="index">
                {{ issue.message }}
              </li>
            </ul>
          </section>
        </div>
      </template>

      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :label="validationModalMode === 'continue' ? 'Stay on this step' : 'Close'"
            @click="closeValidationModal('dismiss')"
          />
          <UButton
            v-if="validationModalMode === 'continue'"
            color="primary"
            label="Continue to poster previews"
            @click="closeValidationModal('continue')"
          />
        </div>
      </template>
    </UModal>

    <!-- Same check as the single-poster editor's "Sections Not Reviewed". -->
    <UModal
      v-model:open="unreviewedModalOpen"
      :title="
        unreviewedSheets.length > 1
          ? 'Sections Not Reviewed'
          : 'AI-Extracted Content Not Reviewed'
      "
      @update:open="(open) => !open && closeUnreviewedModal('review')"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            color="warning"
            variant="subtle"
            :title="`You haven't opened ${unreviewedSheetsLabel}`"
            description="These tabs contain metadata and content extracted from your posters by AI. Reviewing them helps ensure accuracy before publishing."
          />

          <p class="text-sm text-gray-600 dark:text-gray-400">
            We recommend opening
            {{ unreviewedSheets.length > 1 ? "each tab" : "the tab" }} and
            checking the extracted values before continuing.
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-between gap-3">
          <UButton
            variant="outline"
            icon="i-lucide-eye"
            :label="unreviewedSheets.length > 1 ? 'Review Tabs' : 'Review Tab'"
            @click="closeUnreviewedModal('review')"
          />

          <UButton
            color="primary"
            label="Continue Anyway"
            @click="closeUnreviewedModal('continue')"
          />
        </div>
      </template>
    </UModal>

    <!-- One shared lookup drawer; remounted per lookup so it searches on open. -->
    <IdentifierOrcidSearch
      v-if="activeLookup?.kind === 'orcid'"
      :key="`orcid-${activeLookup.idKey}-${String(activeLookup.row.poster_id)}`"
      open
      :given-name="activeLookup.givenName"
      :family-name="activeLookup.familyName"
      :affiliations="activeLookup.affiliations"
      @update:open="(open) => !open && (activeLookup = null)"
      @select="onOrcidLookupSelect"
    />
    <IdentifierRorSearch
      v-if="activeLookup?.kind === 'ror'"
      :key="`ror-${activeLookup.idKey}-${String(activeLookup.row.poster_id)}`"
      open
      :initial-query="activeLookup.query"
      :name-label="activeLookup.nameLabel"
      @update:open="(open) => !open && (activeLookup = null)"
      @select="onRorLookupSelect"
    />
  </div>
</template>
