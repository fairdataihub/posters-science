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
import { mergePosterSheetIntoGrid } from "#shared/utils/posterSheetToGrid";
import {
  forgetSavedPosterSheetRows,
  matchPendingPosterSheetByTitle,
  readPendingPosterSheet,
  unlinkPendingTitleMatch,
} from "~/utils/posterSheetPending";
import {
  rowsWithoutPoster,
  titleMatchesToReview,
} from "#shared/utils/posterSheetTitleMatch";
import type { PosterSheetTitleMatch } from "#shared/types/posterSheetMapping";
import BulkPosterSheetTitleMatches from "~/components/conferences/BulkPosterSheetTitleMatches.vue";

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
    await matchPendingPosterSheetByTitle(props.bulkJobId, data);
    // Snapshot the saved rows first, so cells filled from the poster sheet
    // count as unsaved changes and the changed-only save sends them.
    applySheetPosterRanks(data, rows);
    sheetRows.value = rows;
    savedSnapshot.value = snapshot();
    savedPosterSnapshots.value = posterSnapshots();
    const fromSheet = applyPendingPosterSheet(data, rows);
    applySheetPosterRanks(data, fromSheet.rows);
    sheetRows.value = fromSheet.rows;
    dirty.value = fromSheet.changed;
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
// Tabs are marked opened by a watcher after `fullScreen` below: a tab only
// counts while the spreadsheet editor is open.

/** No tab opened yet: the organizer never opened the spreadsheet editor. */
const unreviewedAllSheets = computed(
  () =>
    unreviewedSheets.value.length > 0 &&
    unreviewedSheets.value.length === (grid.value?.sheets.length ?? 0),
);

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
  fullScreen.value = true;
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
  /** Also check required fields (off for Save draft: only continuing needs them). */
  validate?: boolean;
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

  if (options.validate !== false) {
    const gridIssues = collectGridRequiredIssues();
    issues.push(...gridIssues);

    const strictIssues = await collectStrictFormIssues();
    issues.push(...withoutGridDuplicates(strictIssues, gridIssues));
  }

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
        title: "Poster data saved",
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

const POSTER_COLUMN_WIDTH_PX = 320;
const { width: gridViewportWidth } = useElementSize(gridRoot);

// A second horizontal scrollbar above the grid, kept in sync with the grid's
// own, so wide sheets can be scrolled sideways without reaching the bottom.
const gridTopScroll = ref<HTMLElement | null>(null);
const gridTable = ref<HTMLElement | null>(null);
const { width: gridTableWidth } = useElementSize(gridTable, undefined, {
  box: "border-box",
});
const { width: gridRootOuterWidth } = useElementSize(gridRoot, undefined, {
  box: "border-box",
});
const gridOverflowsX = computed(
  () => gridTableWidth.value > gridViewportWidth.value + 1,
);
/** Matches the grid's scroll range; the grid also has a vertical scrollbar. */
const gridTopScrollWidth = computed(
  () =>
    gridTableWidth.value + (gridRootOuterWidth.value - gridViewportWidth.value),
);

function syncScrollLeft(from: HTMLElement | null, to: HTMLElement | null) {
  if (from && to && to.scrollLeft !== from.scrollLeft) {
    to.scrollLeft = from.scrollLeft;
  }
}

/**
 * The spreadsheet opens over the whole window (the step itself shows only a
 * summary and an open button) and stops the page behind scrolling.
 */
const fullScreen = ref(false);

// A tab only counts as opened (see openedSheets) while the editor is open.
watch(
  [activeSheet, fullScreen],
  ([name, open]) => {
    if (open) markSheetsOpened([name]);
  },
  { immediate: true },
);

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

// The spreadsheet only opens as a full-window editor; Esc closes it,
// unless a dialog is open on top.
onKeyStroke("Escape", () => {
  if (
    unsavedOnCloseModalOpen.value ||
    unreviewedModalOpen.value ||
    validationModalOpen.value ||
    activeLookup.value
  ) {
    return;
  }
  if (fullScreen.value) void requestCloseFullScreen();
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
  "border-default sticky left-0 z-10 max-w-[320px] w-[320px] border-r border-b px-2 py-1.5 text-center align-top font-normal shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]";

/**
 * The sticky poster column needs an opaque background, matching its row's
 * stripe. A merged cell spans several rows, so it skips the row hover tint.
 */
function posterNameColumnClass(shaded: boolean, merged = false) {
  const hover = merged
    ? ""
    : "group-hover:bg-[color-mix(in_oklab,var(--ui-primary)_12%,var(--ui-bg))]";
  return `${shaded ? "bg-elevated" : "bg-default"} ${hover} ${POSTER_NAME_COLUMN_BASE_CLASS}`;
}

/** Whether a repeatable tab shows the "Add …" row under each poster's rows. */
const showAddRowUnderPoster = computed(
  () => Boolean(currentSheet.value?.repeatable) && !props.disabled && !saving.value,
);

/** The first row of a poster spans its rows plus the "Add …" row below them. */
function posterRowSpan(entryIndex: number, entryCount: number): number {
  if (entryIndex > 0) return 0;
  return entryCount + (showAddRowUnderPoster.value ? 1 : 0);
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

/* ---------- Organizer poster sheet ---------- */

/** File names merged from the poster sheet and not saved yet. */
const posterSheetUnsaved = ref<string[]>([]);
/** Title matches to check, and sheet rows still without a poster. */
const posterSheetReview = ref<PosterSheetTitleMatch[]>([]);
const posterSheetWaiting = ref(0);

/**
 * Fill the grid from a poster sheet confirmed on the posters step. Merged
 * cells show as unsaved changes so the user sees and saves them.
 */
function applyPendingPosterSheet(
  data: BulkReviewMetadataGrid,
  rows: Record<string, EditableRow[]>,
): { rows: Record<string, EditableRow[]>; changed: boolean } {
  const pending = readPendingPosterSheet(props.bulkJobId);
  posterSheetReview.value = titleMatchesToReview(pending);
  posterSheetWaiting.value = rowsWithoutPoster(pending);
  if (!pending) return { rows, changed: false };
  const merged = mergePosterSheetIntoGrid(data, rows, pending.sheets);
  const keyed: Record<string, EditableRow[]> = {};
  for (const [name, list] of Object.entries(merged.rows)) {
    keyed[name] = list.map((row) => (row._key ? row : withKey(row)));
  }
  posterSheetUnsaved.value = merged.appliedFileNames;
  if (merged.changedPosterIds.length) {
    toast.add({
      title: "Filled from your poster sheet",
      description: `${merged.changedPosterIds.length} poster(s) updated from ${pending.sheetFileName}. Save to keep these values.`,
      color: "info",
    });
  }

  return { rows: keyed, changed: merged.changedPosterIds.length > 0 };
}

function onGridSaved(savedPosterIds: number[]) {
  if (!savedPosterIds.length) return;
  forgetSavedPosterSheetRows(props.bulkJobId, posterSheetUnsaved.value);
  posterSheetUnsaved.value = [];
  posterSheetReview.value = [];
}

function onUnlinkTitleMatch(rowKey: string) {
  unlinkPendingTitleMatch(props.bulkJobId, rowKey);
  load();
}

const unsavedOnCloseModalOpen = ref(false);

function requestCloseFullScreen() {
  if (!fullScreen.value || unsavedOnCloseModalOpen.value) return;
  if (!hasUnsavedChanges()) {
    fullScreen.value = false;
    return;
  }
  unsavedOnCloseModalOpen.value = true;
}

function dismissUnsavedOnCloseModal() {
  unsavedOnCloseModalOpen.value = false;
}

function discardEditsAndCloseSpreadsheet() {
  dismissUnsavedOnCloseModal();
  resetChanges();
  fullScreen.value = false;
}

async function saveDraftAndCloseSpreadsheet() {
  const saved = await save();
  if (!saved) return;
  dismissUnsavedOnCloseModal();
  fullScreen.value = false;
}

/**
 * Save draft: save as entered without checking required fields (that happens
 * on continue). Only a failed save shows the issues modal.
 */
async function save(): Promise<boolean> {
  if (!props.bulkJobId || saving.value || !grid.value) return false;
  saving.value = true;
  saveIssues.value = [];

  try {
    const { issues, savedPosterIds, saveAttempted } = await collectAllValidationIssues({
      attemptSave: hasUnsavedChanges(),
      validate: false,
    });
    if (saveAttempted) onGridSaved(savedPosterIds);
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
      fullScreen.value = true;

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
    if (saveAttempted) onGridSaved(savedPosterIds);

    if (issues.length === 0) {
      if (saveAttempted) {
        toast.add({
          title: "Poster data saved",
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
  <!-- Full screen: a window-high column where the grid fills the space left
       under the toolbar, so both of its scrollbars stay on screen. -->
  <div
    :class="
      fullScreen
        ? 'bg-default fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto p-4 sm:p-6'
        : 'space-y-4'
    "
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

    <!-- Closed: what to do, and a button that opens the full-window editor. -->
    <div
      v-else-if="grid && !fullScreen"
      class="border-default space-y-5 rounded-xl border p-5 sm:p-6"
    >
      <div class="flex items-start gap-3">
        <span
          class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl"
        >
          <UIcon name="i-lucide-table-2" class="size-5" />
        </span>
        <div class="min-w-0">
          <h4 class="text-base font-semibold">
            {{ grid.posters.length }}
            {{ grid.posters.length === 1 ? "poster" : "posters" }} to review
          </h4>
          <p class="text-muted text-sm">
            Review the AI-extracted details for each poster before publishing.
          </p>
        </div>
      </div>

      <div class="space-y-2 text-sm">
        <p>
          Click <strong class="font-medium">Open poster spreadsheet</strong> to
          review and edit the extracted information. Fill in required fields
          (marked <span class="text-error">*</span>) and add any missing
          information. Use the tabs to navigate sections and add rows where
          needed.
        </p>
        <p>
          Use <strong class="font-medium">Save draft</strong> or
          <strong class="font-medium">Close</strong> in the spreadsheet toolbar
          to save or exit. If you close with unsaved edits, you can save or
          discard them.
        </p>
        <p class="text-muted">
          You can leave required fields incomplete for now, but they must be
          completed in the next step before publishing.
        </p>
      </div>

      <div class="border-default flex flex-col items-center gap-3 border-t pt-5">
        <UButton
          color="primary"
          size="lg"
          icon="i-lucide-table-2"
          label="Open poster spreadsheet"
          @click="fullScreen = true"
        />
      </div>
    </div>

    <template v-else-if="grid">
      <div v-if="fullScreen" class="border-default shrink-0 border-b pb-4">
        <h3 class="text-lg font-semibold">Poster spreadsheet</h3>
        <p class="text-muted mt-1 text-sm">
          Edit AI-extracted metadata for every poster. Changes apply when you
          save a draft or continue to poster previews.
        </p>
      </div>

      <BulkPosterSheetTitleMatches
        v-if="posterSheetReview.length || posterSheetWaiting"
        :matches="posterSheetReview"
        :waiting="posterSheetWaiting"
        :dirty="dirty"
        @unlink="onUnlinkTitleMatch"
      />

      <!-- Toolbar -->
      <div class="flex shrink-0 flex-wrap items-center gap-3">
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
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-x"
            label="Close"
            @click="requestCloseFullScreen()"
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

      <div class="min-w-0 shrink-0 overflow-x-auto">
        <UTabs
          v-model="activeSheet"
          :items="tabItems"
          :content="false"
          class="w-max min-w-full"
          :ui="{
            list: 'inline-flex w-max flex-nowrap',
            trigger:
              'shrink-0 whitespace-nowrap data-[state=inactive]:text-toned',
            label: 'whitespace-nowrap',
          }"
        >
          <!-- Unopened tabs say so on hover: each holds AI-extracted metadata to review. -->
          <template #default="{ item }">
            <span
              :title="
                openedSheets.has(String(item.value))
                  ? undefined
                  : 'Not opened yet: review this AI-extracted metadata'
              "
            >
              {{ item.label }}
            </span>
          </template>
        </UTabs>
      </div>

      <div v-if="currentSheet" class="flex min-h-0 flex-1 flex-col gap-3">
        <div class="flex shrink-0 flex-wrap items-start justify-between gap-3">
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
          class="border-default flex min-h-48 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border"
          :class="{ 'pointer-events-none opacity-60': disabled || saving }"
        >
          <div
            v-show="gridOverflowsX"
            ref="gridTopScroll"
            class="border-default shrink-0 overflow-x-auto overflow-y-hidden overscroll-x-contain border-b"
            aria-hidden="true"
            @scroll="syncScrollLeft(gridTopScroll, gridRoot)"
          >
            <div class="h-px" :style="{ width: `${gridTopScrollWidth}px` }" />
          </div>

          <div
            ref="gridRoot"
            class="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain pb-3"
            @scroll="syncScrollLeft(gridRoot, gridTopScroll)"
          >
            <table
              ref="gridTable"
              class="w-max min-w-full border-separate border-spacing-0 text-sm"
            >
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
                v-for="({ row, index, rowPos }, entryIndex) in group.entries"
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
                :poster-name-class="
                  posterNameColumnClass(
                    group.shaded,
                    posterRowSpan(entryIndex, group.entries.length) > 1,
                  )
                "
                :poster-row-span="posterRowSpan(entryIndex, group.entries.length)"
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
                  showAddRowUnderPoster &&
                  entryIndex === group.entries.length - 1
                "
              >
                <!-- The poster name cell above spans this row, so skip its column. -->
                <td
                  :colspan="tableBodyColumnCount - 1"
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
                      :style="addButtonLabelStyle(POSTER_COLUMN_WIDTH_PX + 8)"
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
        class="shrink-0"
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
        unreviewedAllSheets
          ? 'Poster Spreadsheet Not Reviewed'
          : unreviewedSheets.length > 1
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
            :title="
              unreviewedAllSheets
                ? `You haven't opened the poster spreadsheet yet`
                : `You haven't opened ${unreviewedSheetsLabel}`
            "
            :description="
              unreviewedAllSheets
                ? 'It holds the details extracted from your posters by AI. Reviewing them helps ensure accuracy before publishing.'
                : 'These tabs contain metadata and content extracted from your posters by AI. Reviewing them helps ensure accuracy before publishing.'
            "
          />

          <p class="text-muted text-sm">
            We recommend opening the spreadsheet and checking each section
            before continuing.
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full flex-wrap justify-between gap-3">
          <UButton
            variant="outline"
            icon="i-lucide-table-2"
            label="Open poster spreadsheet"
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

    <UModal
      v-model:open="unsavedOnCloseModalOpen"
      title="Save changes?"
      class="max-w-md"
      :dismissible="!saving"
      @update:open="(open) => !open && !saving && dismissUnsavedOnCloseModal()"
    >
      <template #body>
        <p class="text-muted text-sm">
          You have unsaved edits. Save your draft before closing the
          spreadsheet, or discard them to revert to the last saved version.
        </p>
      </template>

      <template #footer>
        <div class="flex w-full flex-wrap justify-between gap-3">
          <UButton
            color="neutral"
            variant="outline"
            label="Keep editing"
            :disabled="saving"
            @click="dismissUnsavedOnCloseModal"
          />
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Close without saving"
              :disabled="saving"
              @click="discardEditsAndCloseSpreadsheet"
            />
            <UButton
              color="primary"
              label="Save draft"
              :loading="saving"
              :disabled="disabled"
              @click="saveDraftAndCloseSpreadsheet"
            />
          </div>
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
