<script setup lang="ts">
import type {
  PosterSheetIssue,
  PosterSheetMappingResult,
} from "#shared/types/posterSheetMapping";
import type {
  WorksheetHoldReason,
  WorksheetHoldStatus,
} from "#shared/types/bulkWorksheetHold";
import {
  CONFERENCE_WORKSHEET_ACCEPT,
  MAX_CONFERENCE_WORKSHEET_FILES,
  conferenceWorksheetRejection,
} from "#shared/utils/conferenceWorksheets";
import {
  clearPendingPosterSheet,
  loadPendingPosterSheet,
  readPendingPosterSheet,
  writePendingPosterSheet,
} from "~/utils/posterSheetPending";
import WorksheetContactEmail from "~/components/conferences/WorksheetContactEmail.vue";

/**
 * Optional second drop zone on the posters step: the organizer's poster
 * information sheet exported from EasyChair or Curious, the only supported
 * platforms (.xlsx, .xls, .csv, .tsv; an EasyChair export split over CSV files
 * can be dropped together). Platform cards set the instructions.
 * The sheet is mapped to our fields by the extraction API from the chosen
 * platform's template, so there are no columns to choose. A sheet that needs
 * a look opens a panel with how rows link to files and any warnings; once
 * confirmed, the rows fill the metadata grid as posters finish extracting.
 *
 * Rows link to files by a file name column, or by a submission number at the
 * start of the file names. Rows left over are matched by title after
 * extraction, every pairing gets a title check, and the grid lists matches
 * and disagreeing pairings for the organizer to check. The confirmed sheet is
 * stored on the batch, so it survives a reload or another device.
 *
 * The poster file names sent with the sheet include files still uploading, so
 * a sheet dropped mid-upload links to every file; the server re-links rows to
 * the stored names once the uploads land.
 */

const props = defineProps<{
  bulkJobId: string | null;
  /**
   * Poster files in this batch, stored or still uploading; a change re-checks
   * the sheet.
   */
  posterFileNames: string[];
}>();

const SHEET_ACCEPT = ".xlsx,.xlsm,.xls,.csv,.tsv";

const uploadRef = ref<{ clearFiles: () => void } | null>(null);
/** One sheet, or an export split over files (EasyChair submission.csv + author.csv). */
const sheetFiles = ref<File[]>([]);
const sheetName = computed(() =>
  sheetFiles.value.map((file) => file.name).join(" + "),
);
const result = ref<PosterSheetMappingResult | null>(null);
const loading = ref(false);
/** True while the confirm panel is open. */
/** The file(s) last refused, named in the rejection dialog. */
const rejectedName = ref("");
/** Overrides "Fix this in your file…" when the file itself is fine. */
const rejectionHint = ref<string | null>(null);
/** Why the sheet was refused and where, shown in the rejection dialog. */
const rejectionIssues = ref<PosterSheetIssue[]>([]);
const rejectionOpen = ref(false);
/** Long lists show the first few until the organizer asks for the rest. */
const ISSUES_SHOWN = 5;
const showAllIssues = ref(false);
const shownIssues = computed(() =>
  showAllIssues.value
    ? rejectionIssues.value
    : rejectionIssues.value.slice(0, ISSUES_SHOWN),
);
/** Send it to us asks for the email only once it's chosen. */
const sendPanelOpen = ref(false);
/**
 * Send it to us (and the note about it) is offered only for a file that may
 * be a real export we can't read, not for a mistake the organizer can fix.
 */
const sendOffered = ref(false);
/** The files last refused, kept so they can be tried as the other format. */
const rejectedFiles = ref<File[]>([]);
/**
 * The other supported platform the refused sheet looks like (the extraction
 * API's detected_format), offered as a switch in the rejection dialog.
 */
const suggestedPlatform = ref<SheetPlatform | null>(null);

/**
 * Conference platform the sheet was exported from. Only EasyChair and Curious
 * are supported. It is sent with the sheet, and the extraction API refuses a
 * sheet without that platform's columns (format_mismatch).
 */
type SheetPlatform = "easychair" | "curious";
const PLATFORM_OPTIONS: { label: string; value: SheetPlatform }[] = [
  { label: "EasyChair", value: "easychair" },
  { label: "Curious", value: "curious" },
];
/**
 * The cards: a supported platform, another platform, or no worksheet. The
 * drop zone shows once a supported platform is picked.
 */
type SheetChoice = SheetPlatform | "other" | "skip";
const choice = ref<SheetChoice | undefined>(undefined);
const CHOICE_CARDS: {
  label: string;
  description: string;
  value: SheetChoice;
}[] = [
  {
    label: "EasyChair",
    description: "Conference data workbook (.xlsx) or CSV files",
    value: "easychair",
  },
  {
    label: "Curious",
    description: "Poster information worksheet (.xlsx)",
    value: "curious",
  },
  {
    label: "Other platform",
    description:
      "Send us worksheets from a platform we don't support yet, so we can look into it",
    value: "other",
  },
  {
    label: "Skip this step",
    description: "No worksheets: we'll read the details from your posters",
    value: "skip",
  },
];
const platform = computed<SheetPlatform>(() =>
  choice.value === "curious" ? "curious" : "easychair",
);

/**
 * What each card needs before Save and continue, as a problem message or
 * null. Every card passes for now; add a card's own rules to its entry.
 */
/** A supported platform needs its sheet added and confirmed. */
function sheetCheck(): string | null {
  if (confirmedName.value) return null;
  const name = PLATFORM_OPTIONS.find((o) => o.value === choice.value)?.label;
  if (loading.value) return "Wait for your worksheet to finish reading.";
  if (csvMode.value && !hasMainCsv.value)
    return "Add submission.csv to continue, or choose Skip this step.";

  return `Add your ${name} worksheet, or choose Skip this step.`;
}

const CHOICE_CHECKS: Record<SheetChoice, () => string | null> = {
  easychair: sheetCheck,
  curious: sheetCheck,
  other: () =>
    otherFiles.value.length
      ? "Choose Send it to us to send your worksheets, or choose Skip this step."
      : "Add your worksheets and send them to us, or choose Skip this step.",
  skip: () => null,
};
/** Why Save and continue was refused, shown under the cards. */
const stepProblem = ref<string | null>(null);

/** Called by the wizard on Save and continue: a problem message, or null. */
function validate(): string | null {
  // Held: the team has the worksheet, and the batch waits here for it.
  if (heldAt.value) {
    stepProblem.value =
      heldReason.value === "unsupported_platform"
        ? "We're looking into supporting your platform. You can continue once we've emailed you."
        : "We're fixing your worksheet. You can continue once we've emailed you that it's ready.";

    return stepProblem.value;
  }
  // A sheet already added (also from an earlier visit) counts as a choice.
  if (confirmedName.value) {
    stepProblem.value = null;

    return null;
  }
  stepProblem.value = choice.value
    ? CHOICE_CHECKS[choice.value]()
    : "Choose an option to continue.";

  return stepProblem.value;
}

defineExpose({ validate });

/**
 * "Send it to us" in the rejection dialog: the refused files go to the team
 * (Bunny + Slack) with why they were refused, and the batch is held on this
 * step (the server refuses to move it on) until an admin releases it. The
 * organizer then adds their worksheet again, under a format we've added
 * since or as a file we've fixed for them.
 */
const sendingToTeam = ref(false);
const sendError = ref<string | null>(null);
/** When the worksheet was sent to the team, while the batch is held. */
const heldAt = ref<string | null>(null);
const heldReason = ref<WorksheetHoldReason | null>(null);
const heldPlatform = ref<string | null>(null);
/** The hold was released while this page was open. */
const holdReleased = ref(false);
/** Why the released hold was set, for the note after release. */
const releasedReason = ref<WorksheetHoldReason | null>(null);

async function loadHold() {
  if (!props.bulkJobId) return;
  try {
    const result = await $fetch<WorksheetHoldStatus>(
      `/api/bulk-poster-submissions/${props.bulkJobId}/platform-request`,
    );
    if (heldAt.value && !result.heldAt) {
      holdReleased.value = true;
      releasedReason.value = heldReason.value;
    }
    heldAt.value = result.heldAt;
    heldReason.value = result.heldReason;
    heldPlatform.value = result.heldPlatform;
  } catch {
    // Not loaded: keep what we have; the server still enforces the hold.
  }
}

/** Expected by: 7 days after it was sent. */
const heldUntil = computed(() => {
  if (!heldAt.value) return "";
  const due = new Date(new Date(heldAt.value).getTime() + 7 * 86_400_000);

  return due.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
});

// Check now, then every minute while held, so a release shows without a reload.
let holdTimer: ReturnType<typeof setInterval> | null = null;
onMounted(async () => {
  await loadHold();
  holdTimer = setInterval(() => {
    if (heldAt.value) void loadHold();
  }, 60_000);
});
onBeforeUnmount(() => {
  if (holdTimer) clearInterval(holdTimer);
});

/** The email we'll use about sent worksheets, confirmed before sending. */
const { user: sessionUser } = useUserSession();
const contactEmail = ref(sessionUser.value?.emailAddress ?? "");
const contactConfirmed = ref(false);
const contactReady = computed(
  () =>
    contactConfirmed.value &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.value.trim()),
);

/** Other platform card. Sends the files the same way as Send it to us. */
const otherPlatformName = ref("");
const otherFiles = ref<File[]>([]);
const otherUploadRef = ref<{ clearFiles: () => void } | null>(null);
const tooManyOtherFiles = computed(
  () => otherFiles.value.length > MAX_CONFERENCE_WORKSHEET_FILES,
);

/** From the rejection dialog: the refused files and why they were refused. */
function sendToTeam() {
  return sendWorksheets({
    platform: platformLabel.value,
    files: rejectedFiles.value,
    // The team sees the file name even when it was the only one. A wrong
    // platform has no list: the hint is the reason.
    problems: rejectionIssues.value.length
      ? rejectionIssuesForTeam()
      : [rejectionHint.value ?? ""].filter(Boolean),
  });
}

/** "author.csv · Row 1: message" per refusal reason, for the team. */
function rejectionIssuesForTeam() {
  return rejectionIssues.value.map((issue) =>
    [[issue.file, rowLabel(issue)].filter(Boolean).join(" · "), issue.message]
      .filter(Boolean)
      .join(": "),
  );
}

/** From the Other platform card. */
function sendOtherPlatform() {
  if (tooManyOtherFiles.value) return;

  return sendWorksheets({
    platform: otherPlatformName.value.trim(),
    files: otherFiles.value,
    problems: [],
    source: "other_platform",
  });
}

async function sendWorksheets(request: {
  platform: string;
  files: File[];
  problems: string[];
  /** Set by the Other platform card. */
  source?: "other_platform";
}) {
  if (
    !props.bulkJobId ||
    !request.files.length ||
    !contactReady.value ||
    sendingToTeam.value
  )
    return;
  sendingToTeam.value = true;
  sendError.value = null;
  try {
    const form = new FormData();
    form.append("platform", request.platform);
    form.append("problems", JSON.stringify(request.problems));
    if (request.source) form.append("source", request.source);
    form.append("contact_email", contactEmail.value.trim());
    for (const file of request.files) form.append("worksheet", file, file.name);
    const sent = await $fetch<{ heldAt: string }>(
      `/api/bulk-poster-submissions/${props.bulkJobId}/platform-request`,
      { method: "POST", body: form },
    );
    removeSheet();
    choice.value = undefined;
    otherPlatformName.value = "";
    otherFiles.value = [];
    otherUploadRef.value?.clearFiles();
    heldAt.value = sent.heldAt;
    heldReason.value =
      request.source === "other_platform"
        ? "unsupported_platform"
        : "worksheet_error";
    heldPlatform.value = request.platform || null;
  } catch (error) {
    // Our own messages (400, 502) say what to do; anything else is generic.
    const data = (
      error as { data?: { statusCode?: number; statusMessage?: string } }
    )?.data;
    sendError.value =
      (data?.statusCode === 400 ||
        data?.statusCode === 409 ||
        data?.statusCode === 502) &&
      data.statusMessage
        ? data.statusMessage
        : "We couldn't send your worksheet. Try again later.";
  } finally {
    sendingToTeam.value = false;
  }
}

/** "an" before EasyChair, "a" before Curious. */
const platformArticle = computed(() =>
  /^[aeiou]/i.test(platformLabel.value) ? "an" : "a",
);
const platformLabel = computed(
  () =>
    PLATFORM_OPTIONS.find((option) => option.value === platform.value)!.label,
);
const dropDescription = computed(() =>
  platform.value === "easychair"
    ? "Drop the workbook or CSV files here, or click to browse."
    : "Drop the Curious .xlsx file here, or click to browse.",
);

/**
 * What each platform's sheet should look like, shown above the drop zone.
 * Kept in line with the extraction API's templates (sheet_mapper.TEMPLATES).
 */
type FileOption = {
  label: string;
  icon: string;
  /** One Excel file (any name), or CSV files known by name. */
  kind: "excel" | "csv";
  /**
   * columns: the file's first columns, as in a real export, to recognize it
   * by; more: it has other columns after them.
   */
  files: {
    name: string;
    required: boolean;
    columns: string[];
    more: boolean;
  }[];
};
const PLATFORM_EXPECTATIONS: Record<
  SheetPlatform,
  {
    /** Ways to send the sheet; more than one means pick one of them. */
    fileOptions: FileOption[];
    /** A short rule said under the options, if any. */
    fileRule?: string;
  }
> = {
  easychair: {
    fileOptions: [
      {
        label: "The Excel workbook",
        icon: "i-lucide-file-spreadsheet",
        kind: "excel",
        files: [
          {
            name: "EasyChair_conference_data.xlsx",
            required: true,
            columns: ["#", "title", "authors"],
            more: true,
          },
        ],
      },
      {
        label: "The CSV files",
        icon: "i-lucide-files",
        kind: "csv",
        files: [
          {
            name: "submission.csv",
            required: true,
            columns: ["#", "title", "authors"],
            more: true,
          },
          {
            name: "author.csv",
            required: false,
            columns: ["submission #", "first name", "last name"],
            more: true,
          },
          {
            name: "submission_topic.csv",
            required: false,
            columns: ["submission #", "topic"],
            more: false,
          },
          {
            name: "topics.csv",
            required: false,
            columns: ["topic", "header?"],
            more: false,
          },
        ],
      },
    ],
  },
  curious: {
    fileOptions: [
      {
        label: "The Excel template",
        icon: "i-lucide-file-spreadsheet",
        kind: "excel",
        files: [
          {
            name: "Curious_poster_information.xlsx",
            required: true,
            columns: ["Position", "Track", "Title"],
            more: true,
          },
        ],
      },
    ],
    fileRule: "One file only. CSV files are not accepted.",
  },
};
const expectations = computed(() => PLATFORM_EXPECTATIONS[platform.value]);

/**
 * "author.csv · Row 1", or null when it isn't at one place. The file is left
 * out when it was the only one sent: the dialog title already names it.
 */
function issuePlace(issue: PosterSheetIssue) {
  const file = rejectedFiles.value.length > 1 ? issue.file : null;
  const parts = [
    file,
    issue.sheet ? `${issue.sheet} sheet` : null,
    rowLabel(issue),
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : null;
}

/**
 * "Header row" for a problem with the column names (the API sends the
 * columns it found or missed), else "Row 4". Null when it isn't at a row.
 */
function rowLabel(issue: PosterSheetIssue) {
  if (!issue.row) return null;

  return issue.found.length || issue.missing.length
    ? "Header row"
    : `Row ${issue.row}`;
}
const confirmedName = ref<string | null>(
  readPendingPosterSheet(props.bulkJobId)?.sheetFileName ?? null,
);

// The stored copy wins over this browser's cache (another device, a reload).
onMounted(async () => {
  const pending = await loadPendingPosterSheet(props.bulkJobId);
  if (!sheetFiles.value.length)
    confirmedName.value = pending?.sheetFileName ?? null;
});

/** What the sheet step looked like before a drop, to go back to if refused. */
type SheetSnapshot = {
  files: File[];
  result: PosterSheetMappingResult | null;
  confirmedName: string | null;
  choice: SheetChoice | undefined;
};

function snapshot(): SheetSnapshot {
  return {
    files: [...sheetFiles.value],
    result: result.value,
    confirmedName: confirmedName.value,
    choice: choice.value,
  };
}

/**
 * Refuse what was just added: put the step back as it was before (so the
 * drop zone and any files already in come back) and explain in the dialog.
 */
function rejectSheet(
  message: string,
  issues: PosterSheetIssue[],
  before: SheetSnapshot,
  name: string,
  {
    hint,
    files,
    switchTo,
    canSend = true,
  }: {
    hint?: string;
    /** The refused files, kept for Send it to us and the platform switch. */
    files: File[];
    switchTo?: SheetPlatform | null;
    /**
     * False when the organizer can fix it themselves (the wrong platform,
     * file types or files) or should just retry: no Send it to us then.
     */
    canSend?: boolean;
  },
) {
  sendOffered.value = canSend && !switchTo && files.length > 0;
  rejectedName.value = name;
  rejectionHint.value = hint ?? null;
  // A hint that says it all (the wrong platform) needs no list under it.
  rejectionIssues.value = issues.length
    ? issues
    : hint
      ? []
      : [
          {
            message,
            file: null,
            sheet: null,
            row: null,
            missing: [],
            found: [],
          },
        ];
  suggestedPlatform.value = switchTo ?? null;
  rejectedFiles.value = files;
  sendError.value = null;
  sendPanelOpen.value = false;
  showAllIssues.value = false;
  sheetFiles.value = before.files;
  result.value = before.result;
  confirmedName.value = before.confirmedName;
  choice.value = before.choice;
  rejectionOpen.value = true;
}

const suggestedLabel = computed(
  () =>
    PLATFORM_OPTIONS.find((o) => o.value === suggestedPlatform.value)?.label ??
    "",
);

/** Try the refused files again as the platform they look like. */
function switchPlatform() {
  const target = suggestedPlatform.value;
  const files = rejectedFiles.value;
  if (!target || !files.length) return;
  const before = snapshot();
  rejectionOpen.value = false;
  choice.value = target;
  sheetFiles.value = files;
  confirmedName.value = null;
  importSheet(before, files.map((file) => file.name).join(" + "));
}

/** Give up on the worksheet: details come from the posters (Skip this step). */
function continueWithoutSheet() {
  removeSheet();
  choice.value = "skip";
}

async function mapSheet(
  before: SheetSnapshot = snapshot(),
  name: string = sheetName.value,
) {
  if (!props.bulkJobId || !sheetFiles.value.length) return;
  const sent = [...sheetFiles.value];
  loading.value = true;
  try {
    const form = new FormData();
    for (const file of sheetFiles.value) form.append("sheet", file, file.name);
    form.append("file_names", JSON.stringify(props.posterFileNames));
    form.append("format", platform.value);
    const data = await $fetch<PosterSheetMappingResult>(
      `/api/bulk-poster-submissions/${props.bulkJobId}/poster-sheet`,
      { method: "POST", body: form },
    );
    // A worksheet the API read but can't use is refused like any other.
    const problems = data.warnings.filter((w) => w.severity === "error");
    if (!data.ok || problems.length) {
      const message = problems[0]?.message ?? "We couldn't use this worksheet.";
      rejectSheet(
        message,
        problems.map((w) => ({
          message: w.message,
          file: null,
          sheet: null,
          row: null,
          missing: [],
          found: [],
        })),
        before,
        name,
        { files: sent },
      );

      return;
    }
    // Read and usable: it's used straight away. Remove takes it out.
    result.value = data;
    useSheet();
  } catch (error) {
    const data = (
      error as {
        data?: {
          statusMessage?: string;
          data?: {
            code?: string | null;
            detectedFormat?: string | null;
            issues?: PosterSheetIssue[];
          };
        };
      }
    )?.data;
    // A sheet that looks like the other supported platform gets a switch
    // button in the dialog instead of the API's wording.
    const detected = PLATFORM_OPTIONS.find(
      (o) =>
        o.value === data?.data?.detectedFormat && o.value !== platform.value,
    );
    const switchTo =
      data?.data?.code === "format_mismatch" && detected ? detected : null;
    const message = switchTo
      ? `This isn't ${platformArticle.value} ${platformLabel.value} worksheet.`
      : (data?.statusMessage ?? "We couldn't read this worksheet.");
    // The other platform's missing columns aren't worth reading when the
    // dialog offers to switch: one line says what's wrong.
    const issues = switchTo ? [] : (data?.data?.issues ?? []);
    // 422 is the API reading the file and refusing it; anything else is the
    // service failing, which a retry fixes. Wrong files are the organizer's.
    const status = (error as { statusCode?: number })?.statusCode;
    const canSend =
      status === 422 &&
      !(issues.length && issues.every((issue) => issue.fixable));
    rejectSheet(message, issues, before, name, {
      canSend,
      hint: switchTo
        ? `${message} It looks like ${/^[aeiou]/i.test(switchTo.label) ? "an" : "a"} ${switchTo.label} one.`
        : undefined,
      files: sent,
      switchTo: switchTo?.value,
    });
  } finally {
    loading.value = false;
  }
}

const isCsv = (file: File) => /\.(csv|tsv)$/i.test(file.name);
const isExcel = (file: File) => /\.(xlsx|xlsm|xls)$/i.test(file.name);

/** EasyChair's CSV export; only submission.csv is required. */
const EASYCHAIR_CSV_FILES = [
  "submission.csv",
  "author.csv",
  "submission_topic.csv",
  "topics.csv",
];

/** An EasyChair CSV export, which may be added one file at a time. */
const csvMode = computed(
  () =>
    platform.value === "easychair" &&
    sheetFiles.value.length > 0 &&
    sheetFiles.value.every(isCsv),
);
const csvAdded = computed(
  () => new Set(sheetFiles.value.map((file) => file.name.toLowerCase())),
);
const hasMainCsv = computed(() => csvAdded.value.has("submission.csv"));
const csvChecklist = computed(() =>
  EASYCHAIR_CSV_FILES.map((name) => ({
    name,
    required: name === "submission.csv",
    added: csvAdded.value.has(name),
  })),
);

/**
 * The drop zone shows until a sheet is added, and for an EasyChair CSV
 * export until all four files are in (the organizer can continue once
 * submission.csv is imported).
 */
const showDropZone = computed(() => {
  if (choice.value !== "easychair" && choice.value !== "curious") return false;
  if (loading.value) return false;
  if (!sheetFiles.value.length) return !confirmedName.value;

  return (
    csvMode.value &&
    sheetFiles.value.length < EASYCHAIR_CSV_FILES.length &&
    csvChecklist.value.some((file) => !file.added)
  );
});

/**
 * The files box shows while a sheet is being added. Once it's in use and
 * nothing more can be added, the one-line "imported" note is enough.
 */
const showFilesBox = computed(
  () =>
    (choice.value === "easychair" || choice.value === "curious") &&
    (showDropZone.value ||
      (sheetFiles.value.length > 0 && (loading.value || !confirmedName.value))),
);

/** Once files are added, only the way they came (Excel or CSV) is listed. */
const visibleFileOptions = computed(() => {
  const options = expectations.value.fileOptions;
  if (!sheetFiles.value.length) return options;
  const kind = sheetFiles.value.every(isCsv) ? "csv" : "excel";
  const shown = options.filter((option) => option.kind === kind);

  return shown.length ? shown : options;
});

/** The added file that fills an expected one, if any. */
function addedFile(option: FileOption, expected: { name: string }) {
  return option.kind === "excel"
    ? sheetFiles.value.find(isExcel)
    : sheetFiles.value.find(
        (file) => file.name.toLowerCase() === expected.name.toLowerCase(),
      );
}

/** Every file the sheet can have is in. */
const filesDone = computed(
  () => sheetFiles.value.length > 0 && !showDropZone.value,
);
const filesHeading = computed(() => {
  if (!sheetFiles.value.length)
    return `Expected files and format from ${platformLabel.value}`;
  if (csvMode.value && !hasMainCsv.value)
    return "Add submission.csv to continue";
  if (!filesDone.value) return "Add the other CSV files if you have them";

  return "Files added";
});

function onSheetSelected(dropped: File[]) {
  if (!dropped.length) return;
  // We keep the files ourselves, so the next drop starts empty.
  uploadRef.value?.clearFiles();
  const before = snapshot();
  // More CSV files for an EasyChair export already started: add them,
  // replacing a file of the same name.
  const adding = csvMode.value && dropped.every(isCsv);
  const files = adding
    ? [
        ...sheetFiles.value.filter(
          (file) =>
            !dropped.some(
              (d) => d.name.toLowerCase() === file.name.toLowerCase(),
            ),
        ),
        ...dropped,
      ]
    : dropped;
  // The CSV files are the workbook's sheets, so a mix of both is ambiguous.
  if (files.some(isExcel) && files.some(isCsv)) {
    rejectSheet(
      "Add either the Excel workbook or the CSV files, not both.",
      [],
      before,
      dropped.map((file) => file.name).join(" + "),
      { hint: "Add one or the other.", files, canSend: false },
    );

    return;
  }
  // Several files only make sense as one export split over CSV/TSV files.
  const split = files.length > 1 && files.every(isCsv);
  sheetFiles.value = split
    ? files.slice(0, EASYCHAIR_CSV_FILES.length)
    : files.slice(-1);
  confirmedName.value = null;
  importSheet(before, dropped.map((file) => file.name).join(" + "));
}

/** Map the files, or wait while an EasyChair CSV export lacks submission.csv. */
function importSheet(before: SheetSnapshot = snapshot(), name?: string) {
  if (csvMode.value && !hasMainCsv.value) {
    result.value = null;
    if (props.bulkJobId) void clearPendingPosterSheet(props.bulkJobId);

    return;
  }
  mapSheet(before, name);
}

/** Take one added file out (the sheet, or one file of a CSV export). */
function removeFile(name: string) {
  const before = snapshot();
  const left = sheetFiles.value.filter((file) => file.name !== name);
  if (!left.length) {
    removeSheet();

    return;
  }
  sheetFiles.value = left;
  confirmedName.value = null;
  importSheet(before);
}

/** Keep the imported worksheet for the metadata step. */
function useSheet() {
  if (!props.bulkJobId || !result.value?.ok || !sheetFiles.value.length) return;
  void writePendingPosterSheet(props.bulkJobId, {
    sheetFileName: sheetName.value,
    confirmedAt: new Date().toISOString(),
    template: result.value.template,
    sheets: result.value.sheets,
    matchRows: result.value.match_rows,
    pairs: result.value.pairs ?? [],
    pairChecks: {},
    hints: result.value.hints,
    titleMatches: {},
    rejectedMatches: [],
    acceptedMatches: [],
    browserFileNames: [...props.posterFileNames],
  });
  confirmedName.value = sheetName.value;
}

/** Posters in the sheet: rows linked to a file plus rows to match by title. */
const sheetRowCount = computed(
  () =>
    (result.value?.pairs?.length ?? 0) + (result.value?.match_rows.length ?? 0),
);

/** Uploaded posters vs posters in the sheet, when the counts differ. */
const posterCountNote = computed(() => {
  const uploaded = props.posterFileNames.length;
  const inSheet = sheetRowCount.value;
  if (!uploaded || !inSheet || uploaded === inSheet) return null;
  const posters = (n: number) => `${n} ${n === 1 ? "poster" : "posters"}`;

  if (uploaded > inSheet) {
    const rest = uploaded - inSheet;

    return `Your worksheet covers ${inSheet} of ${posters(uploaded)}. We'll read the other ${rest} from ${rest === 1 ? "the poster" : "their posters"}.`;
  }

  const extra = inSheet - uploaded;

  return `Your worksheet lists ${posters(inSheet)}, but ${uploaded} ${uploaded === 1 ? "was" : "were"} uploaded. The other ${extra} ${extra === 1 ? "row won't" : "rows won't"} be used.`;
});

/**
 * The worksheet's poster rows in sheet order, with the file each is already
 * linked to (by file name or number). Rows without one are matched by title
 * after extraction.
 */
const sheetPosterRows = computed(() =>
  [
    ...(result.value?.pairs ?? []).map((p) => ({
      row: p.row,
      title: p.title,
      file: p.file_name as string | null,
    })),
    ...(result.value?.match_rows ?? []).map((r) => ({
      row: r.row,
      title: r.title,
      file: null as string | null,
    })),
  ].sort((a, b) => a.row - b.row),
);

/** The uploaded posters, each with the worksheet row it's linked to, if any. */
const uploadedPosters = computed(() => {
  const rowFor = new Map(
    (result.value?.pairs ?? []).map((p) => [p.file_name, p.row]),
  );

  return props.posterFileNames.map((name) => ({
    name,
    row: rowFor.get(name) ?? null,
  }));
});

function removeSheet() {
  if (props.bulkJobId) void clearPendingPosterSheet(props.bulkJobId);
  sheetFiles.value = [];
  result.value = null;
  confirmedName.value = null;
  rejectionIssues.value = [];
  rejectionOpen.value = false;
  uploadRef.value?.clearFiles();
}

// The refusal message goes once the organizer acts on it.
watch([choice, confirmedName, sheetFiles, heldAt], () => {
  stepProblem.value = null;
});

// New or removed poster files change which rows link; re-check the sheet.
watch(
  () => props.posterFileNames.join("\n"),
  () => {
    if (!sheetFiles.value.length || !result.value) return;
    mapSheet();
  },
);
</script>

<template>
  <div
    class="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
  >
    <h4 class="text-sm font-semibold">Poster worksheets</h4>

    <!-- Held: the team has the worksheet; the batch waits on this step -->
    <div
      v-if="heldAt"
      class="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm [overflow-wrap:anywhere] dark:border-amber-900 dark:bg-amber-950/20"
      role="status"
    >
      <template v-if="heldReason === 'unsupported_platform'">
        <p class="flex items-start gap-2 font-semibold">
          <UIcon
            name="i-lucide-clock"
            class="mt-0.5 size-4 shrink-0 text-amber-600"
          />
          We're looking into supporting
          {{ heldPlatform || "your platform" }}
        </p>

        <p>
          Thanks for sending your worksheets. This batch is on hold while we
          look into whether we can support your platform. We'll email you by
          {{ heldUntil }} either way, and the batch stays on this step until
          then.
        </p>
      </template>

      <template v-else>
        <p class="flex items-start gap-2 font-semibold">
          <UIcon
            name="i-lucide-clock"
            class="mt-0.5 size-4 shrink-0 text-amber-600"
          />
          We're fixing your worksheet
        </p>

        <p>
          Thanks for sending it. This batch is on hold while we look into why we
          couldn't read your worksheet. We'll email you by
          {{ heldUntil }}, and the batch stays on this step until then.
        </p>

        <p class="text-muted">
          Once we've emailed you, come back here and add your worksheet again
          (the fixed file from our email, if we send one). You can still add or
          remove poster files meanwhile.
        </p>
      </template>
    </div>

    <template v-else>
      <UAlert
        v-if="holdReleased"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="
          releasedReason === 'unsupported_platform'
            ? 'You can continue'
            : 'Your worksheet is ready to add'
        "
        :description="
          releasedReason === 'unsupported_platform'
            ? `If our email says we now support your platform, add your worksheet below under that option. Otherwise choose Skip this step, and we'll read the details from your posters.`
            : 'Add your worksheet again below, using the option from our email.'
        "
        close
        @update:open="holdReleased = false"
      />

      <fieldset v-if="!confirmedName" class="space-y-3">
        <legend class="mb-3 text-sm">
          <span class="font-medium">
            Do you have poster worksheets from a conference platform?
          </span>

          <span class="text-muted mt-1 block">
            Not every conference platform is supported. If you see your
            conference platform below and have worksheets with your poster data,
            select it. If your worksheets are from another platform, choose
            Other platform and send them to us, and we'll look into supporting
            it. If you don't have worksheets, choose Skip this step.
          </span>
        </legend>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            v-for="card in CHOICE_CARDS"
            :key="card.value"
            type="button"
            :aria-pressed="choice === card.value"
            :disabled="sheetFiles.length > 0"
            class="group flex flex-col items-center justify-start gap-3 rounded-xl border p-4 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary) disabled:cursor-not-allowed disabled:opacity-60"
            :class="
              choice === card.value
                ? 'border-primary bg-primary/5 ring-primary shadow-sm ring-1'
                : 'border-default hover:border-primary/50 hover:bg-elevated/50 hover:shadow-sm'
            "
            @click="choice = card.value"
          >
            <div class="space-y-0.5">
              <p
                class="flex items-center justify-center gap-1.5 text-sm font-semibold"
              >
                <UIcon
                  :name="
                    choice === card.value
                      ? 'i-lucide-circle-check'
                      : 'i-lucide-circle'
                  "
                  class="size-4"
                  :class="
                    choice === card.value ? 'text-primary' : 'text-dimmed'
                  "
                />
                {{ card.label }}
              </p>

              <p class="text-muted text-xs">{{ card.description }}</p>
            </div>
          </button>
        </div>
      </fieldset>

      <p v-if="!confirmedName && sheetFiles.length" class="text-muted text-xs">
        Remove your worksheet files to choose a different option.
      </p>

      <p
        v-if="stepProblem"
        class="text-error flex items-center gap-2 text-sm"
        role="alert"
      >
        <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
        {{ stepProblem }}
      </p>

      <!-- Other platform: send the worksheets to the team (holds the batch) -->
      <div
        v-if="choice === 'other' && !confirmedName"
        class="border-default bg-elevated/40 space-y-3 rounded-lg border p-3 text-sm"
      >
        <div>
          <p>
            Send us your platform's worksheets and we'll look into supporting
            it. While we take a look, your batch will be on hold on this step
            for up to 7 days. We'll email you either way to let you know whether
            we can support your platform.
          </p>

          <p class="text-muted">
            If you'd rather not send your worksheets, select "Skip this step"
            and we'll extract the details from your posters instead.
          </p>
        </div>

        <form class="space-y-2" @submit.prevent="sendOtherPlatform">
          <UFormField label="Platform">
            <UInput
              v-model="otherPlatformName"
              placeholder="e.g. Oxford Abstracts, ConfTool"
              :maxlength="100"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Worksheet files"
            required
            :error="
              tooManyOtherFiles
                ? `Add up to ${MAX_CONFERENCE_WORKSHEET_FILES} files.`
                : undefined
            "
          >
            <UiFileUpload
              ref="otherUploadRef"
              multiple
              title="Add your worksheet files"
              :description="`Drag and drop up to ${MAX_CONFERENCE_WORKSHEET_FILES} files here, or click to browse.`"
              hint="Spreadsheet, CSV, TSV, JSON or XML, up to 10 MB each."
              :accept="CONFERENCE_WORKSHEET_ACCEPT"
              :validate-file="conferenceWorksheetRejection"
              @on-change="otherFiles = $event"
            >
              <UiFileUploadGrid />
            </UiFileUpload>
          </UFormField>

          <WorksheetContactEmail
            v-model:email="contactEmail"
            v-model:confirmed="contactConfirmed"
            help="We'll take a look at your worksheets and let you know within 7 days whether we can support your platform."
          />

          <UButton
            type="submit"
            label="Send it to us"
            icon="i-lucide-send"
            color="primary"
            :loading="sendingToTeam"
            :disabled="!otherFiles.length || tooManyOtherFiles || !contactReady"
          />
        </form>

        <p v-if="sendError" class="text-error" role="alert">
          {{ sendError }}
        </p>
      </div>

      <!-- The worksheet in use -->
      <div
        v-if="confirmedName"
        class="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/60 px-3 py-2 text-sm dark:border-green-900 dark:bg-green-950/20"
      >
        <UIcon
          name="i-lucide-circle-check"
          class="text-success size-4 shrink-0"
        />

        <span class="min-w-0 flex-1 truncate" :title="confirmedName">
          <span class="font-medium">{{ confirmedName }}</span>
          imported
          <template v-if="sheetRowCount">
            · {{ sheetRowCount }}
            {{ sheetRowCount === 1 ? "poster" : "posters" }}
          </template>
        </span>

        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          label="Remove"
          @click="removeSheet"
        />
      </div>

      <!-- Counts differ: the uploaded posters and the worksheet's rows, side by side -->
      <section
        v-if="confirmedName && posterCountNote"
        class="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 sm:p-4 dark:border-amber-900/60 dark:bg-amber-950/20"
        aria-label="Posters uploaded and posters in your worksheet"
      >
        <p
          class="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"
        >
          <UIcon
            name="i-lucide-triangle-alert"
            class="mt-0.5 size-4 shrink-0"
          />
          {{ posterCountNote }}
        </p>

        <div class="grid items-start gap-3 sm:grid-cols-2">
          <div
            class="border-default bg-default flex min-w-0 flex-col overflow-hidden rounded-md border"
          >
            <h4
              class="border-default bg-elevated/60 flex items-center justify-between gap-2 border-b px-3 py-2 text-xs font-semibold"
            >
              <span class="flex items-center gap-1.5">
                <UIcon name="i-lucide-file-text" class="size-3.5" />
                Posters uploaded
              </span>

              <span class="text-muted font-normal tabular-nums">
                {{ uploadedPosters.length }}
              </span>
            </h4>

            <ul class="divide-default max-h-[500px] divide-y overflow-y-auto">
              <li
                v-for="poster in uploadedPosters"
                :key="poster.name"
                class="flex items-center justify-between gap-3 px-3 py-1.5 text-sm"
              >
                <span class="min-w-0 truncate" :title="poster.name">
                  {{ poster.name }}
                </span>

                <span
                  v-if="poster.row"
                  class="text-muted shrink-0 text-xs tabular-nums"
                >
                  Row {{ poster.row }}
                </span>
              </li>
            </ul>
          </div>

          <div
            class="border-default bg-default flex min-w-0 flex-col overflow-hidden rounded-md border"
          >
            <h4
              class="border-default bg-elevated/60 flex items-center justify-between gap-2 border-b px-3 py-2 text-xs font-semibold"
            >
              <span class="flex items-center gap-1.5">
                <UIcon name="i-lucide-table" class="size-3.5" />
                In your worksheet
              </span>

              <span class="text-muted font-normal tabular-nums">
                {{ sheetPosterRows.length }}
              </span>
            </h4>

            <ul class="divide-default max-h-[500px] divide-y overflow-y-auto">
              <li
                v-for="row in sheetPosterRows"
                :key="row.row"
                class="flex items-baseline gap-3 px-3 py-1.5 text-sm"
              >
                <span class="text-muted w-14 shrink-0 text-xs tabular-nums">
                  Row {{ row.row }}
                </span>

                <span class="min-w-0 flex-1">
                  <span class="line-clamp-2" :title="row.title">
                    {{ row.title || "(no title)" }}
                  </span>

                  <span
                    v-if="row.file"
                    class="text-muted block truncate text-xs"
                    :title="row.file"
                  >
                    {{ row.file }}
                  </span>
                </span>
              </li>
            </ul>
          </div>
        </div>

        <p class="text-muted text-xs">
          Rows not linked to a file yet are paired with posters by title after
          we read them.
        </p>
      </section>

      <template v-if="showFilesBox">
        <!-- Expected files and format, ticked off as they're added -->
        <section
          class="border-default bg-elevated/40 space-y-3 rounded-lg border p-3 text-sm sm:p-4"
          :aria-label="filesHeading"
        >
          <p class="flex items-center gap-2 font-semibold">
            <UIcon
              :name="filesDone ? 'i-lucide-circle-check' : 'i-lucide-info'"
              class="size-4 shrink-0"
              :class="filesDone ? 'text-success' : 'text-primary'"
            />
            {{ filesHeading }}
          </p>

          <div>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <template
                v-for="(option, index) in visibleFileOptions"
                :key="option.label"
              >
                <!-- OR between the ways to send the sheet -->
                <div
                  v-if="index"
                  class="flex items-center gap-2 sm:flex-col"
                  aria-hidden="true"
                >
                  <span
                    class="h-px flex-1 bg-gray-200 sm:h-auto sm:w-px dark:bg-gray-700"
                  />

                  <span
                    class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-bold tracking-wide"
                  >
                    OR
                  </span>

                  <span
                    class="h-px flex-1 bg-gray-200 sm:h-auto sm:w-px dark:bg-gray-700"
                  />
                </div>

                <div
                  class="border-default bg-default flex-1 rounded-md border p-3"
                >
                  <p class="flex items-center gap-2 font-medium">
                    <span v-if="index" class="sr-only">Or</span>

                    <UIcon
                      :name="option.icon"
                      class="text-muted size-4 shrink-0"
                    />
                    {{ option.label }}
                  </p>

                  <ul
                    class="mt-2 divide-y divide-gray-200 dark:divide-gray-700"
                  >
                    <li
                      v-for="file in option.files"
                      :key="file.name"
                      class="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 first:pt-0 last:pb-0"
                    >
                      <UIcon
                        :name="
                          addedFile(option, file)
                            ? 'i-lucide-circle-check'
                            : 'i-lucide-circle'
                        "
                        class="size-4 shrink-0"
                        :class="
                          addedFile(option, file)
                            ? 'text-success'
                            : 'text-dimmed'
                        "
                        :aria-label="
                          addedFile(option, file) ? 'Added' : 'Not added'
                        "
                      />

                      <span
                        class="min-w-0 flex-1 truncate font-mono text-xs"
                        :title="addedFile(option, file)?.name ?? file.name"
                      >
                        {{ addedFile(option, file)?.name ?? file.name }}
                      </span>

                      <UButton
                        v-if="addedFile(option, file)"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-x"
                        :disabled="loading"
                        :aria-label="`Remove ${addedFile(option, file)!.name}`"
                        @click="removeFile(addedFile(option, file)!.name)"
                      />

                      <template v-else>
                        <UBadge
                          size="sm"
                          variant="subtle"
                          :color="file.required ? 'primary' : 'neutral'"
                          :label="file.required ? 'Required' : 'Optional'"
                        />

                        <span
                          class="flex w-full flex-wrap items-center gap-1 pl-6"
                          :aria-label="`Headers: ${file.columns.join(', ')}${file.more ? ', and more' : ''}`"
                        >
                          <span class="text-muted text-xs" aria-hidden="true">
                            Headers:
                          </span>

                          <span
                            v-for="column in file.columns"
                            :key="column"
                            class="bg-elevated text-muted rounded px-1 py-px font-mono text-[11px] leading-4 ring-1 ring-gray-200 dark:ring-gray-700"
                            aria-hidden="true"
                          >
                            {{ column }}
                          </span>

                          <span
                            v-if="file.more"
                            class="text-muted text-xs"
                            title="More headers follow"
                            aria-hidden="true"
                          >
                            …
                          </span>
                        </span>
                      </template>
                    </li>
                  </ul>
                </div>
              </template>
            </div>

            <p
              v-if="expectations.fileRule && !sheetFiles.length"
              class="text-muted mt-1.5 text-xs"
            >
              {{ expectations.fileRule }}
            </p>
          </div>
        </section>

        <UiFileUpload
          v-if="showDropZone"
          ref="uploadRef"
          multiple
          hide-file-list
          :title="
            !sheetFiles.length
              ? `Add your ${platformLabel} worksheet`
              : hasMainCsv
                ? 'Add more CSV files'
                : 'Add submission.csv'
          "
          :description="
            sheetFiles.length
              ? 'Drop one or more CSV files here, or click to browse.'
              : dropDescription
          "
          :accept="SHEET_ACCEPT"
          @on-change="onSheetSelected"
        >
          <UiFileUploadGrid />
        </UiFileUpload>
      </template>

      <div
        v-if="loading"
        class="text-muted flex items-center gap-2 text-sm"
        aria-live="polite"
      >
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Reading {{ sheetName }}…
      </div>
    </template>

    <!-- Why the sheet was refused, and where -->
    <UModal
      v-model:open="rejectionOpen"
      :title="
        rejectedFiles.length > 1
          ? 'We couldn\'t use these files'
          : `We couldn't use ${rejectedName || 'this file'}`
      "
      :description="
        rejectionHint ??
        `Fix ${rejectionIssues.length === 1 ? 'this' : 'these'} and add the ${rejectedFiles.length > 1 ? 'files' : 'file'} again.`
      "
      :ui="{
        content: 'sm:max-w-xl',
        footer: 'justify-end',
        body:
          rejectionIssues.length || sendOffered || sendError ? '' : 'hidden',
      }"
    >
      <template #body>
        <ul
          v-if="rejectionIssues.length"
          class="divide-default divide-y text-sm"
        >
          <li
            v-for="(issue, index) in shownIssues"
            :key="index"
            class="py-2 first:pt-0 last:pb-0"
          >
            <p class="break-words">
              <span v-if="issuePlace(issue)" class="text-muted font-medium">
                {{ issuePlace(issue) }}:
              </span>
              {{ issue.message }}
            </p>

            <p
              v-if="issue.missing.length"
              class="mt-1 font-mono text-xs break-words text-red-700 dark:text-red-300"
            >
              {{ issue.missing.join(", ") }}
            </p>
          </li>
        </ul>

        <UButton
          v-if="rejectionIssues.length > ISSUES_SHOWN && !showAllIssues"
          variant="link"
          color="neutral"
          size="sm"
          class="mt-1 px-0"
          :label="`Show ${rejectionIssues.length - ISSUES_SHOWN} more`"
          @click="showAllIssues = true"
        />

        <!-- A file straight from the platform that still fails is ours to fix. -->
        <template v-if="sendOffered">
          <USeparator
            label="Exported it straight from the platform?"
            :class="rejectionIssues.length ? 'mt-5' : ''"
          />

          <p class="text-muted mt-3 text-sm">
            If you exported this worksheet from {{ platformLabel }} and it still
            won't import, send it to the Posters.science team and we'll look
            into it. Your batch will be on hold on this step while we do (up to
            7 days), and we'll email you when you can continue.
          </p>

          <WorksheetContactEmail
            v-if="sendPanelOpen"
            v-model:email="contactEmail"
            v-model:confirmed="contactConfirmed"
            help=""
            class="mt-3"
          />
        </template>

        <p v-if="sendError" class="text-error mt-2 text-sm" role="alert">
          {{ sendError }}
        </p>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full flex-wrap items-stretch justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Continue without a worksheet"
            @click="continueWithoutSheet"
          />

          <UButton
            v-if="sendOffered && !sendPanelOpen"
            color="neutral"
            variant="outline"
            label="Send it to us"
            @click="sendPanelOpen = true"
          />

          <UButton
            v-if="sendOffered && sendPanelOpen"
            color="neutral"
            variant="outline"
            icon="i-lucide-send"
            label="Send"
            :loading="sendingToTeam"
            :disabled="!contactReady"
            @click="sendToTeam"
          />

          <UButton
            v-if="suggestedPlatform"
            color="primary"
            :label="`Use as ${suggestedLabel}`"
            @click="switchPlatform"
          />

          <UButton
            v-else
            color="primary"
            label="Choose another file"
            @click="close"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
