<script setup lang="ts">
import type {
  PosterSheetMappingResult,
  PosterSheetWarning,
} from "#shared/types/posterSheetMapping";
import {
  clearPendingPosterSheet,
  readPendingPosterSheet,
  writePendingPosterSheet,
} from "~/utils/posterSheetPending";

/**
 * Optional second drop zone on the posters step: the organizer's own poster
 * information sheet (Curious, EasyChair, our template; .xlsx, .xls, .csv,
 * .tsv; an EasyChair export split over CSV files can be dropped together).
 * The sheet is mapped to our fields by the extraction API. A confirm panel
 * shows the mapping, how rows link to files and any warnings; once confirmed,
 * the rows fill the metadata grid as posters finish extracting.
 *
 * Rows link to files by a file name column, or by a submission number in the
 * file names. Rows left over are matched by title after extraction, and the
 * grid lists those matches for the organizer to check.
 */

const props = defineProps<{
  bulkJobId: string | null;
  /** Poster files already added to this batch; a change re-checks the sheet. */
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
const confirmedName = ref<string | null>(
  readPendingPosterSheet(props.bulkJobId)?.sheetFileName ?? null,
);

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
  try {
    const form = new FormData();
    for (const file of sheetFiles.value) form.append("sheet", file, file.name);
    if (overrides) form.append("mapping", JSON.stringify(overrides));
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
    const data = (error as { data?: { statusMessage?: string } })?.data;
    errorMessage.value =
      data?.statusMessage ?? "Could not read this spreadsheet.";
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
  sheetFiles.value = split ? files.slice(0, 3) : files.slice(-1);
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
  writePendingPosterSheet(props.bulkJobId, {
    sheetFileName: sheetName.value,
    confirmedAt: new Date().toISOString(),
    template: result.value.template,
    sheets: result.value.sheets,
    matchRows: result.value.match_rows,
    titleMatches: {},
    rejectedMatches: [],
  });
  confirmedName.value = sheetName.value;
  if (options.silent) return;
  const linked = result.value.file_column?.matched_rows ?? 0;
  const byTitle = result.value.match_rows.length;
  const parts = [
    linked
      ? `${linked} poster(s) will be filled as they finish extracting`
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
  if (props.bulkJobId) clearPendingPosterSheet(props.bulkJobId);
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
    <div>
      <h4 class="text-sm font-semibold">Poster information (optional)</h4>

      <p class="text-muted mt-1 text-sm">
        Already have a spreadsheet of your posters, such as titles, authors and
        abstracts (your own, Curious or an EasyChair download)? Add it here and
        we will use it instead of extracting those fields. Anything it leaves
        empty is still read from the poster. A column with each poster's file
        name links rows exactly. Without one, we match rows to posters by title
        after extraction and you check the matches.
      </p>
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
      v-else-if="!reviewing && !loading"
      ref="uploadRef"
      multiple
      hide-file-list
      title="Add your poster information sheet"
      description="Drag and drop an .xlsx, .xls, .csv or .tsv file here, or click to browse. For an EasyChair export in CSV files, add submission.csv and author.csv together."
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
