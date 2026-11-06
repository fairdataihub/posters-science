<script setup lang="ts">
import BulkImportMetadataGridRow from "~/components/conferences/BulkImportMetadataGridRow.vue";
import { strictIssueMessage } from "~/utils/strictIssueLabel";
import { useElementSize } from "@vueuse/core";
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
import { bulkReviewGridChoicesForFillKey } from "~/utils/bulkReviewGridFieldChoices";
import { mergePosterSheetIntoGrid } from "#shared/utils/posterSheetToGrid";
import {
  forgetSavedPosterSheetRows,
  readPendingPosterSheet,
} from "~/utils/posterSheetPending";

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
const MAX_AFFILIATION_SLOTS = 30;

function cellChoices(fillKey: string): readonly string[] | undefined {
  return bulkReviewGridChoicesForFillKey(fillKey);
}

const toast = useToast();
const loading = ref(false);
const saving = ref(false);
const loadError = ref<string | null>(null);
/** A validation issue tagged with the grid tab (or other area) where it is fixed. */
type GridValidationIssue = BulkImportValidationIssue & { sheet?: string };

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
watch(dirty, (value) => emit("dirtyChange", value));

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
    const fromSheet = applyPendingPosterSheet(data, rows);
    applySheetPosterRanks(data, fromSheet.rows);
    sheetRows.value = fromSheet.rows;
    savedSnapshot.value = snapshot();
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
  return sheet.columns.filter((column) => {
    if (column.system) return false;
    const slot = affiliationSlot(column.fillKey);
    return slot == null || slot <= shownAffiliationSlots.value;
  });
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

function isMissingRequired(column: BulkReviewGridColumn, row: EditableRow) {
  if (column.requirement !== "required") return false;
  if (currentSheet.value?.name === CREATORS_SHEET) {
    if (column.fillKey === "family_name" && row.name_type === "Organizational") {
      return false;
    }
  }
  return !(row[column.fillKey] ?? "").trim();
}

function isBlankRepeatableRow(sheetName: string, row: BulkReviewGridRow) {
  if (sheetName === CREATORS_SHEET) {
    return !row.given_name?.trim() && !row.family_name?.trim();
  }
  return false;
}

function cellMissingRequired(
  sheetName: string,
  column: BulkReviewGridColumn,
  row: BulkReviewGridRow,
) {
  if (column.requirement !== "required") return false;
  if (sheetName === CREATORS_SHEET) {
    if (column.fillKey === "family_name" && row.name_type === "Organizational") {
      return false;
    }
    if (isBlankRepeatableRow(sheetName, row)) return false;
  }
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

  if (options.attemptSave && dirty.value) {
    saveAttempted = true;
    const sheets: Record<string, BulkReviewGridRow[]> = {};
    for (const [name, rows] of Object.entries(sheetRows.value)) {
      sheets[name] = stripKeys(rows);
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

  issues.push(...collectGridRequiredIssues());

  const strictIssues = await collectStrictFormIssues();
  issues.push(...strictIssues);

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

/** Posters (passing the filter) with their visible rows, in display order. */
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
    .filter((group) => group.entries.length > 0 || sheet.repeatable);
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
 * Full-width add buttons span the whole (wide) table; pin their label to the
 * visible part of the scroll area so it stays readable while scrolling sideways.
 */
function addButtonLabelStyle(leftOffsetPx: number) {
  const width = Math.max(160, gridViewportWidth.value - leftOffsetPx - 8);
  return { left: `${leftOffsetPx}px`, width: `${width}px`, maxWidth: "100%" };
}

const posterNameColumnClass =
  "bg-default border-default group-hover:bg-elevated sticky left-0 z-10 max-w-[320px] w-[320px] border-r border-b px-2 py-1.5 text-left align-top font-normal shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]";

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

/**
 * Fill the grid from a poster sheet confirmed on the posters step. Merged
 * cells show as unsaved changes so the user sees and saves them.
 */
function applyPendingPosterSheet(
  data: BulkReviewMetadataGrid,
  rows: Record<string, EditableRow[]>,
): { rows: Record<string, EditableRow[]>; changed: boolean } {
  const pending = readPendingPosterSheet(props.bulkJobId);
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
}

async function save(): Promise<boolean> {
  if (!props.bulkJobId || saving.value || !grid.value) return false;
  saving.value = true;
  saveIssues.value = [];

  try {
    const { issues, savedPosterIds, saveAttempted } = await collectAllValidationIssues({
      attemptSave: dirty.value,
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
  saving.value = true;
  saveIssues.value = [];

  try {
    const { issues, savedPosterIds, saveAttempted } = await collectAllValidationIssues({
      attemptSave: dirty.value,
    });
    if (saveAttempted) onGridSaved(savedPosterIds);

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

defineExpose({ reload: load, save, prepareStepTransition, dirty });

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
  <div class="space-y-4">
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
            variant="ghost"
            icon="i-lucide-rotate-ccw"
            label="Discard changes"
            :disabled="!dirty || saving"
            @click="resetChanges"
          />
          <UButton
            color="primary"
            icon="i-lucide-save"
            label="Save metadata"
            :loading="saving"
            :disabled="!dirty || disabled"
            @click="save"
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
        />
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
                color="neutral"
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
                  color="neutral"
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
            class="max-h-[65vh] min-w-0 overflow-x-auto overflow-y-auto overscroll-x-contain"
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
                  v-for="column in editableColumns"
                  :key="column.fillKey"
                  class="border-default border-r border-b px-2 py-2 text-left align-top font-semibold"
                  :style="{
                    width: `${columnWidthPx(column)}px`,
                    minWidth: `${columnWidthPx(column)}px`,
                    maxWidth: `${MAX_COLUMN_WIDTH_PX}px`,
                  }"
                  :title="column.instruction || column.hint"
                >
                  <span class="inline-flex items-center gap-1 whitespace-nowrap">
                    {{ column.header }}
                    <span v-if="column.requirement === 'required'" class="text-error" aria-label="required">*</span>
                    <UIcon
                      v-if="column.instruction || column.hint"
                      name="i-lucide-info"
                      class="text-dimmed size-3.5"
                    />
                  </span>
                </th>
                <th
                  v-if="currentSheet.repeatable"
                  class="border-default border-b px-2 py-2 text-left font-semibold"
                >
                  <span class="sr-only">Row actions</span>
                </th>
              </tr>
            </thead>

            <tbody>
              <template v-for="group in displayGroups" :key="group.posterId">
              <tr
                v-if="group.entries.length === 0"
                class="group"
              >
                <th scope="row" :class="posterNameColumnClass">
                  <span
                    class="block text-sm font-normal [overflow-wrap:anywhere]"
                  >
                    {{ posterDisplayName(group.posterId) }}
                  </span>
                </th>
                <td
                  :colspan="tableBodyColumnCount - 1"
                  class="border-default bg-default border-b px-2 py-1 align-middle"
                >
                  <button
                    type="button"
                    class="text-muted hover:text-default hover:bg-elevated/70 border-default block w-full rounded-md border border-dashed py-1.5 text-xs font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
                :poster-name-class="posterNameColumnClass"
                :cell-choices="cellChoices"
                :cell-style="cellWidthStyle"
                :is-missing-required="isMissingRequired"
                @cell-input="onCellInput"
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
                  class="border-default bg-default border-b px-2 py-1"
                >
                  <button
                    type="button"
                    class="text-muted hover:text-default hover:bg-elevated/70 border-default block w-full rounded-md border border-dashed py-1.5 text-xs font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
                  color="neutral"
                  variant="link"
                  trailing-icon="i-lucide-arrow-right"
                  :label="`Go to ${group.name}`"
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
                color="neutral"
                variant="link"
                trailing-icon="i-lucide-arrow-right"
                :label="`Go to ${group.name}`"
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
  </div>
</template>
