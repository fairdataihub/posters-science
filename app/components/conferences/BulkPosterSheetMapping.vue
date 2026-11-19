<script setup lang="ts">
import type {
  PosterSheetMappingResult,
  PosterSheetWarning,
} from "#shared/types/posterSheetMapping";
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

/**
 * Optional second drop zone on the posters step: the organizer's poster
 * information sheet exported from EasyChair or Curious, the only supported
 * platforms (.xlsx, .xls, .csv, .tsv; an EasyChair export split over CSV files
 * can be dropped together). Platform cards set the instructions.
 * The sheet is mapped to our fields by the extraction API. A confirm panel
 * shows the mapping, how rows link to files and any warnings; once confirmed,
 * the rows fill the metadata grid as posters finish extracting.
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

const FIELD_LABELS: Record<string, string> = {
  file_name: "Poster file name",
  title: "Title",
  authors: "Authors",
  affiliations: "Affiliations",
  abstract: "Abstract",
  keywords: "Keywords",
  track: "Track (added as a keyword)",
  language: "Language",
  domain: "Field of study",
  website: "Website (related link)",
  doi: "Existing DOI",
  contact_name: "Contact author (not stored)",
  contact_email: "Contact email (not stored)",
  poster_number: "Poster number (not stored)",
  social: "Social media (not stored)",
  comment: "Comment (not stored)",
  decision: "Decision (only accepted rows are used)",
  deleted: "Deleted (these rows are skipped)",
  form_fields: "EasyChair form fields",
  ignored: "Not used",
};

const toast = useToast();
const uploadRef = ref<{ clearFiles: () => void } | null>(null);
/** One sheet, or an export split over files (EasyChair submission.csv + author.csv). */
const sheetFiles = ref<File[]>([]);
const sheetName = computed(() =>
  sheetFiles.value.map((file) => file.name).join(" + "),
);
const result = ref<PosterSheetMappingResult | null>(null);
const choices = ref<Record<string, string | null>>({});
const loading = ref(false);
/** True while the confirm panel is open. */
const reviewing = ref(false);
const errorMessage = ref<string | null>(null);

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
 * Asked first as cards: which platform the sheet is from, or none. The drop
 * zone shows once a platform is picked.
 */
type SheetChoice = SheetPlatform | "none";
const choice = ref<SheetChoice | undefined>(undefined);
const CHOICE_CARDS: {
  label: string;
  logo?: string;
  description: string;
  value: SheetChoice;
}[] = [
  {
    label: "EasyChair",
    logo: "/assets/images/EasyChair_logo.png",
    description: "Submissions download (.xlsx) or its CSV files",
    value: "easychair",
  },
  {
    label: "Curious",
    logo: "/assets/images/curious_conference_logo.svg",
    description: "Poster information sheet (.xlsx or .csv)",
    value: "curious",
  },
  {
    label: "None of these",
    description: "No worksheets, or they're from another platform",
    value: "none",
  },
];
const platform = computed<SheetPlatform>(() =>
  choice.value === "curious" ? "curious" : "easychair",
);

/**
 * What each card needs before Save and continue, as a problem message or
 * null. Every card passes for now; add a card's own rules to its entry.
 */
const CHOICE_CHECKS: Record<SheetChoice, () => string | null> = {
  easychair: () => null,
  curious: () => null,
  none: () => null,
};
/** Set once Save and continue was tried without a card chosen. */
const choiceMissing = ref(false);
watch(choice, () => {
  choiceMissing.value = false;
});

/** Called by the wizard on Save and continue: a problem message, or null. */
function validate(): string | null {
  // A sheet already added counts as a choice.
  if (confirmedName.value) return null;
  if (!choice.value) {
    choiceMissing.value = true;

    return "Choose a poster worksheet option, or None of these.";
  }

  return CHOICE_CHECKS[choice.value]();
}

defineExpose({ validate });

/** "None of these": the organizer can ask us to support their platform. */
const requestedPlatform = ref("");
const requestedWorksheets = ref<File[]>([]);
const platformRequestSending = ref(false);
const platformRequestSent = ref(false);
const platformRequestError = ref<string | null>(null);
const platformRequestEmpty = computed(
  () => !requestedPlatform.value.trim() && !requestedWorksheets.value.length,
);
const tooManyWorksheets = computed(
  () => requestedWorksheets.value.length > MAX_CONFERENCE_WORKSHEET_FILES,
);

// Already sent for this batch: show the thanks instead of the form.
onMounted(async () => {
  if (!props.bulkJobId) return;
  try {
    const { submitted } = await $fetch<{ submitted: boolean }>(
      `/api/bulk-poster-submissions/${props.bulkJobId}/platform-request`,
    );
    platformRequestSent.value = submitted;
  } catch {
    // Not loaded: the empty form still works.
  }
});

async function sendPlatformRequest() {
  if (
    !props.bulkJobId ||
    platformRequestEmpty.value ||
    tooManyWorksheets.value ||
    platformRequestSending.value
  )
    return;
  platformRequestSending.value = true;
  platformRequestError.value = null;
  try {
    const form = new FormData();
    form.append("platform", requestedPlatform.value.trim());
    for (const file of requestedWorksheets.value)
      form.append("worksheet", file, file.name);
    await $fetch(
      `/api/bulk-poster-submissions/${props.bulkJobId}/platform-request`,
      { method: "POST", body: form },
    );
    platformRequestSent.value = true;
  } catch (error) {
    // Our own messages (400, 502) say what to do; anything else is generic.
    const data = (
      error as { data?: { statusCode?: number; statusMessage?: string } }
    )?.data;
    platformRequestError.value =
      (data?.statusCode === 400 || data?.statusCode === 502) &&
      data.statusMessage
        ? data.statusMessage
        : "Could not send your request. Try again later.";
  } finally {
    platformRequestSending.value = false;
  }
}

const platformLabel = computed(
  () =>
    PLATFORM_OPTIONS.find((option) => option.value === platform.value)!.label,
);
const dropDescription = computed(() =>
  platform.value === "easychair"
    ? "Drag and drop your EasyChair submissions download (.xlsx) here, or click to browse. For the CSV export, add submission.csv, author.csv, submission_topic.csv and topics.csv together."
    : "Drag and drop your Curious poster information sheet (.xlsx or .csv) here, or click to browse.",
);
/** The other platform, when a refused sheet looks like it. */
const suggestedPlatform = ref<SheetPlatform | null>(null);

function switchPlatform(value: SheetPlatform) {
  choice.value = value;
  mapSheet();
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

const fieldOptions = computed(() => [
  { label: "Don't use", value: "__none__" },
  ...Object.keys(result.value?.fields ?? FIELD_LABELS).map((value) => ({
    label: FIELD_LABELS[value] ?? value,
    value,
  })),
]);

const choicesChanged = computed(() =>
  (result.value?.mapping ?? []).some(
    (column) => (choices.value[column.column] ?? null) !== column.field,
  ),
);

const errors = computed(() =>
  (result.value?.warnings ?? []).filter((w) => w.severity === "error"),
);
const otherWarnings = computed(() =>
  (result.value?.warnings ?? []).filter((w) => w.severity !== "error"),
);

const canConfirm = computed(
  () => !!result.value?.ok && !choicesChanged.value && !loading.value,
);

function warningColor(warning: PosterSheetWarning) {
  if (warning.severity === "error") return "error" as const;
  if (warning.severity === "warning") return "warning" as const;

  return "neutral" as const;
}

function sourceLabel(source: string) {
  return (
    {
      template: "Template",
      alias: "Header",
      fuzzy: "Close match",
      llm: "Suggested",
      values: "File names",
      user: "Your choice",
    } as Record<string, string>
  )[source];
}

async function mapSheet(overrides?: Record<string, string | null>) {
  if (!props.bulkJobId || !sheetFiles.value.length) return;
  loading.value = true;
  errorMessage.value = null;
  suggestedPlatform.value = null;
  try {
    const form = new FormData();
    for (const file of sheetFiles.value) form.append("sheet", file, file.name);
    if (overrides) form.append("mapping", JSON.stringify(overrides));
    form.append("file_names", JSON.stringify(props.posterFileNames));
    form.append("format", platform.value);
    const data = await $fetch<PosterSheetMappingResult>(
      `/api/bulk-poster-submissions/${props.bulkJobId}/poster-sheet`,
      { method: "POST", body: form },
    );
    result.value = data;
    choices.value = Object.fromEntries(
      data.mapping.map((column) => [column.column, column.field]),
    );
    // A saved template with every row linked needs no review.
    if (!data.needs_confirmation && data.ok)
      confirm({ silent: !reviewing.value && !!confirmedName.value });
    else reviewing.value = true;
  } catch (error) {
    const data = (
      error as {
        data?: {
          statusMessage?: string;
          data?: { code?: string; detectedFormat?: string | null };
        };
      }
    )?.data;
    if (data?.data?.code === "format_mismatch") {
      const detected = PLATFORM_OPTIONS.find(
        (option) => option.value === data.data?.detectedFormat,
      );
      suggestedPlatform.value = detected?.value ?? null;
      errorMessage.value = detected
        ? `This looks like a ${detected.label} sheet, not ${platformLabel.value}`
        : `This doesn't look like a ${platformLabel.value} export`;
    } else {
      errorMessage.value =
        data?.statusMessage ?? "Could not read this spreadsheet.";
    }
    result.value = null;
  } finally {
    loading.value = false;
  }
}

function onSheetSelected(files: File[]) {
  if (!files.length) return;
  // Several files only make sense as one export split over CSV/TSV files.
  const split =
    files.length > 1 && files.every((f) => /\.(csv|tsv)$/i.test(f.name));
  // EasyChair's CSV export is up to four files: submission, author,
  // submission_topic and topics.
  sheetFiles.value = split ? files.slice(0, 4) : files.slice(-1);
  confirmedName.value = null;
  mapSheet();
}

function setChoice(column: string, value: string) {
  choices.value = {
    ...choices.value,
    [column]: value === "__none__" ? null : value,
  };
}

function openReview() {
  reviewing.value = true;
}

function applyChoices() {
  mapSheet(choices.value);
}

function confirm(options: { silent?: boolean } = {}) {
  if (!props.bulkJobId || !result.value?.ok || !sheetFiles.value.length) return;
  reviewing.value = false;
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
  if (options.silent) return;
  const linked = result.value.file_column?.matched_rows ?? 0;
  const byTitle = result.value.match_rows.length;
  const parts = [
    linked
      ? `${linked} poster(s) will be filled as they finish extracting, and their titles checked against the sheet`
      : "",
    byTitle
      ? `${byTitle} row(s) will be matched to posters by title after extraction`
      : "",
  ].filter(Boolean);
  toast.add({
    title: "Poster information added",
    description: `${sheetName.value}: ${parts.join("; ")}.`,
    color: "success",
  });
}

const fileLinkLabel = computed(() => {
  const link = result.value?.file_column;
  if (!link) return "";
  const head = `${link.matched_rows} of ${link.rows} rows linked`;
  if (link.method === "number")
    return `${head} by the number in '${link.column}'`;
  const extra = [
    link.methods?.column_fuzzy
      ? `${link.methods.column_fuzzy} by a close file name, check them`
      : "",
    link.methods?.number ? `${link.methods.number} by number` : "",
  ].filter(Boolean);

  return `${head} by '${link.column}'${extra.length ? ` (${extra.join("; ")})` : ""}`;
});

function removeSheet() {
  if (props.bulkJobId) void clearPendingPosterSheet(props.bulkJobId);
  sheetFiles.value = [];
  result.value = null;
  reviewing.value = false;
  confirmedName.value = null;
  errorMessage.value = null;
  uploadRef.value?.clearFiles();
}

// New or removed poster files change which rows link; re-check the sheet.
watch(
  () => props.posterFileNames.join("\n"),
  () => {
    if (!sheetFiles.value.length || !result.value) return;
    const userChoices = result.value.mapping.some(
      (column) => column.source === "user",
    );
    mapSheet(userChoices ? choices.value : undefined);
  },
);
</script>

<template>
  <div
    class="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
  >
    <h4 class="text-sm font-semibold">Poster information (optional)</h4>

    <fieldset v-if="!confirmedName" class="space-y-3">
      <legend class="mb-3 text-sm">
        <span class="font-medium">
          Do you have poster worksheets from a conference platform?
        </span>

        <span class="text-muted block">
          Pick yours below. If you don't have any or don't see your platform,
          choose None of these.
        </span>
      </legend>

      <div class="grid gap-3 sm:grid-cols-3">
        <button
          v-for="card in CHOICE_CARDS"
          :key="card.value"
          type="button"
          :aria-pressed="choice === card.value"
          :disabled="sheetFiles.length > 0"
          class="group flex flex-col items-center gap-3 rounded-xl border p-4 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary) disabled:cursor-not-allowed disabled:opacity-60"
          :class="
            choice === card.value
              ? 'border-primary bg-primary/5 ring-primary shadow-sm ring-1'
              : 'border-default hover:border-primary/50 hover:bg-elevated/50 hover:shadow-sm'
          "
          @click="choice = card.value"
        >
          <div
            class="flex h-16 w-full items-center justify-center rounded-lg bg-white px-4"
          >
            <img
              v-if="card.logo"
              :src="card.logo"
              :alt="card.label"
              class="max-h-10 w-auto max-w-full object-contain"
            />

            <div v-else class="flex items-center gap-2 text-gray-400">
              <UIcon name="i-lucide-skip-forward" class="size-6 shrink-0" />

              <span class="text-sm font-semibold whitespace-nowrap">
                Skip this step
              </span>
            </div>
          </div>

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
                :class="choice === card.value ? 'text-primary' : 'text-dimmed'"
              />
              {{ card.label }}
            </p>

            <p class="text-muted text-xs">{{ card.description }}</p>
          </div>
        </button>
      </div>
    </fieldset>

    <p
      v-if="choiceMissing"
      class="text-error flex items-center gap-2 text-sm"
      role="alert"
    >
      <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
      Choose an option to continue.
    </p>

    <div
      v-if="choice === 'none'"
      class="border-default bg-elevated/40 space-y-3 rounded-lg border p-3 text-sm"
    >
      <p
        v-if="platformRequestSent"
        class="flex items-center gap-2"
        aria-live="polite"
      >
        <UIcon name="i-lucide-mail-check" class="text-success size-4" />
        Thanks, your message was sent to the team.
      </p>

      <template v-else>
        <div>
          <p>
            Using a platform we don't support yet? Tell us about it and we'll
            look into adding it.
          </p>

          <p class="text-muted">
            This is optional. You can skip it and continue, and we'll read the
            details from your posters.
          </p>
        </div>

        <form class="space-y-2" @submit.prevent="sendPlatformRequest">
          <UFormField label="Platform">
            <UInput
              v-model="requestedPlatform"
              placeholder="e.g. Oxford Abstracts, ConfTool"
              :maxlength="100"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Worksheet files"
            :error="
              tooManyWorksheets
                ? `Add up to ${MAX_CONFERENCE_WORKSHEET_FILES} files.`
                : undefined
            "
          >
            <UiFileUpload
              multiple
              title="Add your worksheet files"
              :description="`Drag and drop up to ${MAX_CONFERENCE_WORKSHEET_FILES} files here, or click to browse.`"
              hint="Spreadsheet, CSV, TSV, JSON or XML, up to 10 MB each."
              :accept="CONFERENCE_WORKSHEET_ACCEPT"
              :validate-file="conferenceWorksheetRejection"
              @on-change="requestedWorksheets = $event"
            >
              <UiFileUploadGrid />
            </UiFileUpload>
          </UFormField>

          <UButton
            type="submit"
            label="Request support"
            icon="i-lucide-send"
            color="neutral"
            variant="outline"
            :loading="platformRequestSending"
            :disabled="platformRequestEmpty || tooManyWorksheets"
          />
        </form>

        <p v-if="platformRequestError" class="text-error" role="alert">
          {{ platformRequestError }}
        </p>
      </template>
    </div>

    <UAlert
      v-if="confirmedName && !reviewing"
      color="success"
      variant="subtle"
      icon="i-lucide-check"
      :title="`Using ${confirmedName}`"
      description="Its rows fill the metadata as posters finish extracting. Rows matched by title are listed in the metadata step for you to check."
    >
      <template #actions>
        <UButton
          v-if="result"
          size="xs"
          color="neutral"
          variant="outline"
          label="Review columns"
          @click="openReview"
        />

        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          label="Remove"
          @click="removeSheet"
        />
      </template>
    </UAlert>

    <UiFileUpload
      v-else-if="choice && choice !== 'none' && !reviewing && !loading"
      ref="uploadRef"
      multiple
      hide-file-list
      :title="`Add your ${platformLabel} poster sheet`"
      :description="dropDescription"
      :accept="SHEET_ACCEPT"
      @on-change="onSheetSelected"
    >
      <UiFileUploadGrid />
    </UiFileUpload>

    <div
      v-if="loading"
      class="text-muted flex items-center gap-2 text-sm"
      aria-live="polite"
    >
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
      Reading {{ sheetName }}…
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-alert-triangle"
      :title="errorMessage"
    >
      <template #actions>
        <UButton
          v-if="suggestedPlatform"
          size="xs"
          color="neutral"
          variant="outline"
          :label="`Use as ${PLATFORM_OPTIONS.find((option) => option.value === suggestedPlatform)?.label}`"
          @click="switchPlatform(suggestedPlatform)"
        />

        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          label="Choose another file"
          @click="removeSheet"
        />
      </template>
    </UAlert>

    <div v-if="result && reviewing && !loading" class="space-y-4">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <UIcon name="i-lucide-file-spreadsheet" class="size-4" />

        <span class="font-medium">{{ sheetName }}</span>

        <UBadge
          v-if="result.template.known"
          color="success"
          variant="subtle"
          :label="`Recognized: ${result.template.name}`"
        />

        <UBadge
          v-else
          color="warning"
          variant="subtle"
          label="New format: check the columns"
        />

        <UBadge
          v-if="result.file_column"
          color="neutral"
          variant="subtle"
          :label="fileLinkLabel"
        />

        <UBadge
          v-if="result.match_rows.length"
          color="neutral"
          variant="subtle"
          :label="`${result.match_rows.length} row(s) to match by title`"
        />

        <UBadge
          v-if="result.authors_table"
          color="neutral"
          variant="subtle"
          :label="`Authors from '${result.authors_table}'`"
        />
      </div>

      <UAlert
        v-for="warning in errors"
        :key="warning.code + warning.message"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-triangle"
        :description="warning.message"
      />

      <div class="border-default overflow-x-auto rounded-md border">
        <table class="w-full text-left text-sm">
          <thead class="bg-elevated/50 text-muted text-xs">
            <tr>
              <th class="px-3 py-2 font-medium">Your column</th>

              <th class="px-3 py-2 font-medium">Our field</th>

              <th class="px-3 py-2 font-medium">Example values</th>
            </tr>
          </thead>

          <tbody class="divide-default divide-y">
            <tr v-for="column in result.mapping" :key="column.column">
              <td class="px-3 py-2 align-top font-medium">
                {{ column.column }}
              </td>

              <td class="px-3 py-2 align-top">
                <div class="flex items-center gap-2">
                  <USelect
                    size="sm"
                    class="min-w-52"
                    :items="fieldOptions"
                    :model-value="choices[column.column] ?? '__none__'"
                    @update:model-value="
                      (value: string) => setChoice(column.column, value)
                    "
                  />

                  <span
                    v-if="sourceLabel(column.source)"
                    class="text-muted text-xs"
                  >
                    {{ sourceLabel(column.source) }}
                  </span>
                </div>
              </td>

              <td class="text-muted max-w-md px-3 py-2 align-top">
                <span class="line-clamp-2">{{
                  column.samples.join(" · ") || "(empty)"
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul v-if="otherWarnings.length" class="space-y-1 text-sm">
        <li
          v-for="warning in otherWarnings"
          :key="warning.code + warning.message"
          class="flex gap-2"
        >
          <UIcon
            :name="
              warning.severity === 'info'
                ? 'i-lucide-info'
                : 'i-lucide-alert-circle'
            "
            class="mt-0.5 size-4 shrink-0"
            :class="
              warningColor(warning) === 'warning'
                ? 'text-warning'
                : 'text-muted'
            "
          />

          <span>{{ warning.message }}</span>
        </li>
      </ul>

      <details
        v-if="result.unmatched_rows.length || result.unmatched_files.length"
        class="text-sm"
      >
        <summary class="cursor-pointer font-medium">
          Rows and files that don't match
        </summary>

        <div class="mt-2 grid gap-4 sm:grid-cols-2">
          <div v-if="result.unmatched_rows.length">
            <p class="text-muted mb-1 text-xs">
              Rows whose file name matches no poster (matched by title after
              extraction)
            </p>

            <ul class="space-y-0.5">
              <li v-for="row in result.unmatched_rows" :key="row.row">
                Row {{ row.row }}: {{ row.value || "(no file name)" }}
                <span v-if="row.title" class="text-muted"
                  >· {{ row.title }}</span
                >
              </li>
            </ul>
          </div>

          <div v-if="result.unmatched_files.length">
            <p class="text-muted mb-1 text-xs">
              Poster files with no linked row yet
            </p>

            <ul class="space-y-0.5">
              <li v-for="name in result.unmatched_files" :key="name">
                {{ name }}
              </li>
            </ul>
          </div>
        </div>
      </details>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          label="Remove sheet"
          @click="removeSheet"
        />

        <UButton
          v-if="choicesChanged"
          color="neutral"
          variant="subtle"
          icon="i-lucide-refresh-cw"
          label="Apply my column choices"
          @click="applyChoices"
        />

        <UButton
          color="primary"
          icon="i-lucide-check"
          label="Use this sheet"
          :disabled="!canConfirm"
          @click="confirm()"
        />
      </div>
    </div>
  </div>
</template>
