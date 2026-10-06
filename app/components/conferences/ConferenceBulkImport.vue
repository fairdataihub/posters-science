<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";
import {
  ALLOWED_POSTER_FILE_LABEL,
  MAX_POSTER_FILE_SIZE_LABEL,
  POSTER_FILE_ACCEPT,
  posterFileRejectionReason,
} from "#shared/utils/posterFile";
import {
  CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME,
  CONFERENCE_BULK_IMPORT_WIZARD_STEPS,
  type BulkImportBatchItem,
  type BulkImportBatchItemStatus,
  type BulkImportSubmissionRow,
  type ConferenceBulkImportWizardStep,
} from "#shared/types/conferenceBulkImport";
import {
  buildSubmissionRowsForZipBundle,
  countSubmissionRowsByStatus,
  submissionRowStatusColor,
  submissionRowStatusLabel,
} from "~/utils/conferenceBulkImportSubmissions";
import { conferenceImportSpreadsheetCsvFromFileNames } from "~/utils/conferenceImportSpreadsheet";
import { conferenceManagementDetailPath } from "~/utils/conferenceManagementPaths";

const props = defineProps<{
  conferenceAcronym: string;
  conferenceId: string;
}>();

const toast = useToast();

const preparedImportZip = ref<File[]>([]);
const posterFiles = ref<File[]>([]);
const licenseMetadataGenerated = ref(false);

const POSTER_ONLY_HINT = `${ALLOWED_POSTER_FILE_LABEL}, up to ${MAX_POSTER_FILE_SIZE_LABEL} per file`;

const validatePosterFile = (file: File) =>
  posterFileRejectionReason({
    name: file.name,
    type: file.type,
    size: file.size,
  });

const wizardSteps = CONFERENCE_BULK_IMPORT_WIZARD_STEPS;

function stepIndex(step: ConferenceBulkImportWizardStep) {
  return wizardSteps.findIndex((item) => item.id === step);
}

const currentStep = ref<ConferenceBulkImportWizardStep>("assets");

function goToStep(step: ConferenceBulkImportWizardStep) {
  if (step === "review") {
    void refreshSubmissionRows();
  }
  currentStep.value = step;
}

const currentStepNumber = computed(() => stepIndex(currentStep.value) + 1);

function validateZipFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".zip")) {
    return "Upload a ZIP file (.zip).";
  }
  if (file.size > 500 * 1024 * 1024) {
    return "ZIP files must be 500 MB or smaller.";
  }
  return null;
}

function validatePosterOnlyFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".zip")) {
    return `Use poster PDFs or images here to generate ${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv.`;
  }
  return validatePosterFile(file);
}

function onPreparedImportZipChange(files: File[]) {
  preparedImportZip.value = files;
}

function onPosterFilesChange(files: File[]) {
  posterFiles.value = files;
  licenseMetadataGenerated.value = false;
  preparedImportZip.value = [];
}

const posterFileNames = computed(() =>
  posterFiles.value.map((file) => file.name),
);

const preparedZipNames = computed(() =>
  preparedImportZip.value.map((file) => file.name),
);

const step1Complete = computed(() => preparedImportZip.value.length > 0);

const submissionRows = ref<BulkImportSubmissionRow[]>([]);
const submissionLoading = ref(false);

const submissionColumns: ColumnDef<BulkImportSubmissionRow>[] = [
  { accessorKey: "fileName", header: "Poster file" },
  { accessorKey: "license", header: "License" },
  { id: "status", header: "Status", enableSorting: false },
];

const submissionStatusCounts = computed(() =>
  countSubmissionRowsByStatus(submissionRows.value),
);

const readySubmissionCount = computed(
  () => submissionStatusCounts.value.ready ?? 0,
);

const canProceedFromReview = computed(
  () => step1Complete.value && submissionRows.value.length > 0,
);

async function refreshSubmissionRows() {
  submissionLoading.value = true;

  try {
    const zip = preparedImportZip.value[0];
    submissionRows.value = zip ? buildSubmissionRowsForZipBundle(zip.name) : [];
  } finally {
    submissionLoading.value = false;
  }
}

const batchItems = ref<BulkImportBatchItem[]>([]);
const batchImportRunning = ref(false);
const batchImportFinished = ref(false);
let batchSimulationTimer: ReturnType<typeof setTimeout> | undefined;

const batchProgress = computed(() => {
  if (batchItems.value.length === 0) return 0;
  const done = batchItems.value.filter(
    (item) => item.status === "completed" || item.status === "failed",
  ).length;
  return Math.round((done / batchItems.value.length) * 100);
});

const batchCompletedCount = computed(
  () => batchItems.value.filter((item) => item.status === "completed").length,
);

const batchFailedCount = computed(
  () => batchItems.value.filter((item) => item.status === "failed").length,
);

const batchColumns: ColumnDef<BulkImportBatchItem>[] = [
  { accessorKey: "fileName", header: "Poster file" },
  { id: "batchStatus", header: "Progress", enableSorting: false },
];

const expectedBatchCount = computed(() => 8);

function batchStatusLabel(status: BulkImportBatchItemStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "uploading":
      return "Uploading";
    case "extracting":
      return "Extracting metadata";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

function batchStatusColor(
  status: BulkImportBatchItemStatus,
): "success" | "warning" | "error" | "info" | "neutral" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "extracting":
    case "uploading":
      return "info";
    case "queued":
      return "neutral";
    default:
      return "neutral";
  }
}

function buildSimulatedBatchItems(): BulkImportBatchItem[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `zip-sim-${index + 1}`,
    fileName: `poster-${String(index + 1).padStart(2, "0")}.pdf`,
    status: "queued" as const,
  }));
}

function downloadGeneratedLicensesCsv() {
  const fileNames = posterFiles.value.map((file) => file.name);
  const csv = conferenceImportSpreadsheetCsvFromFileNames(fileNames);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  licenseMetadataGenerated.value = true;
}

function stopBatchSimulation() {
  if (batchSimulationTimer) {
    clearTimeout(batchSimulationTimer);
    batchSimulationTimer = undefined;
  }
}

function advanceBatchSimulation() {
  const next = batchItems.value.find((item) => item.status === "queued");
  if (!next) {
    batchImportRunning.value = false;
    batchImportFinished.value = true;
    return;
  }

  const stages: BulkImportBatchItemStatus[] = [
    "uploading",
    "extracting",
    "completed",
  ];
  let stageIndex = 0;

  const tick = () => {
    const item = batchItems.value.find((entry) => entry.id === next.id);
    if (!item) return;

    item.status = stages[stageIndex] ?? "completed";
    stageIndex += 1;

    if (item.status === "completed") {
      batchSimulationTimer = setTimeout(advanceBatchSimulation, 400);
      return;
    }

    batchSimulationTimer = setTimeout(tick, 700);
  };

  tick();
}

onBeforeUnmount(() => {
  stopBatchSimulation();
});

function continueToReview() {
  if (!step1Complete.value) return;
  goToStep("review");
}

function continueToSubmit() {
  if (!canProceedFromReview.value) return;
  goToStep("submit");
}

function startImport() {
  if (batchImportRunning.value) return;

  stopBatchSimulation();
  batchImportFinished.value = false;
  batchItems.value = buildSimulatedBatchItems();

  if (batchItems.value.length === 0) {
    toast.add({
      title: "Nothing to import",
      description: "Fix submission issues on the review step first.",
      color: "warning",
    });
    return;
  }

  batchImportRunning.value = true;
  toast.add({
    title: "Simulated import started",
    description:
      "This preview runs in the browser only until bulk import is connected to the server.",
    color: "info",
  });
  advanceBatchSimulation();
}

function stepIsDone(step: ConferenceBulkImportWizardStep) {
  const idx = stepIndex(step);
  const currentIdx = stepIndex(currentStep.value);
  if (idx < currentIdx) return true;
  if (step === "assets") return step1Complete.value && currentIdx > idx;
  return false;
}

function stepIsActive(step: ConferenceBulkImportWizardStep) {
  return step === currentStep.value;
}
</script>

<template>
  <UCard class="flex flex-col">
    <template #header>
      <div class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">Bulk import</h2>

        <nav aria-label="Bulk import progress">
          <ol class="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
            <li
              v-for="(step, index) in wizardSteps"
              :key="step.id"
              class="min-w-0 flex-1"
            >
              <button
                type="button"
                class="hover:bg-muted/40 flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors"
                :class="
                  stepIsActive(step.id)
                    ? 'bg-muted/30 ring-primary/30 ring-1'
                    : ''
                "
                :aria-current="stepIsActive(step.id) ? 'step' : undefined"
                @click="goToStep(step.id)"
              >
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  :class="
                    stepIsActive(step.id)
                      ? 'bg-primary text-inverted'
                      : stepIsDone(step.id)
                        ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted'
                  "
                >
                  <UIcon
                    v-if="stepIsDone(step.id) && !stepIsActive(step.id)"
                    name="i-lucide-check"
                    class="size-4"
                  />
                  <span v-else>{{ index + 1 }}</span>
                </span>

                <div class="min-w-0 pt-0.5">
                  <p
                    class="text-sm font-medium"
                    :class="
                      stepIsActive(step.id) ? 'text-highlighted' : 'text-muted'
                    "
                  >
                    {{ step.label }}
                  </p>
                  <p class="text-muted text-xs">{{ step.description }}</p>
                </div>
              </button>
            </li>
          </ol>
        </nav>
      </div>
    </template>

    <div class="flex flex-col gap-8">
      <template v-if="currentStep === 'assets'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Posters &amp; license metadata
            </h3>
            <p class="text-muted mt-1 text-sm">
              In order to bulk submit posters, you will need to attribute a
              license to each poster. Follow the steps below to attribute
              licenses to each poster and begin the submission process.
            </p>
          </div>
        </div>

        <div
          class="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
        >
          <div>
            <h4 class="text-sm font-semibold">
              1. Generate license metadata file.
            </h4>
            <p class="text-muted mt-1 text-sm">
              Import all of your poster PDFs or images here to generate an excel
              file which will help you attribute licenses to posters in bulk.
            </p>
          </div>

          <UiFileUpload
            hide-file-list
            hide-rejections
            multiple
            :accept="POSTER_FILE_ACCEPT"
            :validate-file="validatePosterOnlyFile"
            :hint="`${POSTER_ONLY_HINT} — for generating ${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv only`"
            @on-change="onPosterFilesChange"
          >
            <UiFileUploadGrid />
          </UiFileUpload>

          <ul
            v-if="posterFileNames.length > 0"
            class="border-default divide-default max-h-[500px] divide-y overflow-y-auto rounded-md border"
          >
            <li
              v-for="name in posterFileNames"
              :key="name"
              class="truncate px-3 py-1.5 text-sm"
              :title="name"
            >
              {{ name }}
            </li>
          </ul>

          <UButton
            v-if="posterFiles.length > 0"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-file-spreadsheet"
            :label="`Generate ${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv`"
            @click="downloadGeneratedLicensesCsv"
          />
        </div>

        <div
          v-if="licenseMetadataGenerated"
          class="border-primary/30 space-y-4 rounded-lg border-2 border-dashed p-4"
        >
          <div>
            <h4 class="text-sm font-semibold">2. Upload posters for import</h4>
            <p class="text-muted mt-1 text-sm">
              Required. Upload one ZIP containing your poster PDFs or images and
              your completed
              <span class="font-medium">{{
                CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME
              }}</span>
              at the top level (for example
              <span class="font-medium"
                >{{
                  CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME
                }}.xlsx</span
              >).
            </p>
          </div>

          <UiFileUpload
            hide-file-list
            hide-rejections
            :accept="'.zip,application/zip'"
            :validate-file="validateZipFile"
            hint="One ZIP file, up to 500 MB"
            @on-change="onPreparedImportZipChange"
          >
            <UiFileUploadGrid />
          </UiFileUpload>

          <ul
            v-if="preparedZipNames.length > 0"
            class="border-default divide-default max-h-[500px] divide-y overflow-y-auto rounded-md border"
          >
            <li
              v-for="name in preparedZipNames"
              :key="name"
              class="truncate px-3 py-1.5 text-sm"
              :title="name"
            >
              {{ name }}
            </li>
          </ul>
        </div>

        <div
          class="flex flex-col items-end gap-2 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Continue to review"
            :disabled="!step1Complete"
            @click="continueToReview"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'review'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Review submissions
            </h3>
            <p class="text-muted mt-1 text-sm">
              Each poster file must match a row in
              {{ CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME }} with a
              valid SPDX license before import.
            </p>
          </div>

          <UAlert
            color="info"
            variant="soft"
            icon="i-lucide-info"
            title="ZIP bundle"
            description="Poster files inside your ZIP will be listed after unpack when server import is enabled. You can continue to the simulated batch progress step."
          />

          <div v-if="submissionRows.length > 0" class="flex flex-wrap gap-2">
            <UBadge color="success" variant="soft" size="sm">
              {{ readySubmissionCount }} ready
            </UBadge>
            <UBadge
              v-if="(submissionStatusCounts.missing_license ?? 0) > 0"
              color="warning"
              variant="soft"
              size="sm"
            >
              {{ submissionStatusCounts.missing_license }} missing license
            </UBadge>
            <UBadge
              v-if="(submissionStatusCounts.missing_file ?? 0) > 0"
              color="warning"
              variant="soft"
              size="sm"
            >
              {{ submissionStatusCounts.missing_file }} missing file
            </UBadge>
            <UBadge
              v-if="(submissionStatusCounts.invalid_license ?? 0) > 0"
              color="error"
              variant="soft"
              size="sm"
            >
              {{ submissionStatusCounts.invalid_license }} invalid license
            </UBadge>
          </div>

          <div
            class="border-default relative overflow-x-auto rounded-lg border"
          >
            <div
              v-if="submissionLoading"
              class="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/60 dark:bg-black/30"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="text-primary size-8 animate-spin"
              />
            </div>

            <UTable
              :data="submissionRows"
              :columns="submissionColumns"
              class="max-h-[480px]"
            >
              <template #fileName-cell="{ row }">
                <span
                  class="line-clamp-2 max-w-md text-sm font-medium"
                  :title="row.original.fileName"
                >
                  {{ row.original.fileName }}
                </span>
              </template>

              <template #license-cell="{ row }">
                <UBadge
                  v-if="row.original.license"
                  color="neutral"
                  variant="soft"
                  size="xs"
                >
                  {{ row.original.license }}
                </UBadge>
                <span v-else class="text-muted text-sm">—</span>
              </template>

              <template #status-cell="{ row }">
                <UBadge
                  :color="submissionRowStatusColor(row.original.status)"
                  variant="solid"
                  size="xs"
                >
                  {{ submissionRowStatusLabel(row.original.status) }}
                </UBadge>
              </template>
            </UTable>
          </div>
        </div>

        <div
          class="flex flex-wrap justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-arrow-left"
            label="Back"
            @click="goToStep('assets')"
          />
          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Continue to import"
            :disabled="!canProceedFromReview || submissionLoading"
            @click="continueToSubmit"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'submit'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Batch import
            </h3>
            <p class="text-muted mt-1 text-sm">
              Upload and metadata extraction for each poster in this batch.
              Finished posters will show under conference management →
              Submitted.
            </p>
          </div>

          <UAlert
            v-if="!batchImportRunning && !batchImportFinished"
            color="info"
            variant="soft"
            icon="i-lucide-info"
            title="Ready to start"
            :description="`${expectedBatchCount} poster(s) in this batch (simulated until the server endpoint is connected).`"
          />

          <UAlert
            v-else-if="batchImportRunning"
            color="info"
            variant="soft"
            icon="i-lucide-loader-circle"
            title="Import in progress"
            :description="`${batchCompletedCount} of ${batchItems.length} completed${batchFailedCount ? ` · ${batchFailedCount} failed` : ''}.`"
          />

          <UAlert
            v-else-if="batchImportFinished"
            color="success"
            variant="soft"
            icon="i-lucide-circle-check"
            title="Batch import complete (simulated)"
            description="When this is wired up, posters will appear on your conference dashboard as they finish processing."
          />

          <div v-if="batchItems.length > 0" class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Overall progress</span>
              <span class="font-medium">{{ batchProgress }}%</span>
            </div>
            <UProgress :model-value="batchProgress" size="sm" />
          </div>

          <div
            v-if="batchItems.length > 0"
            class="border-default overflow-x-auto rounded-lg border"
          >
            <UTable :data="batchItems" :columns="batchColumns">
              <template #fileName-cell="{ row }">
                <span
                  class="line-clamp-2 max-w-md text-sm font-medium"
                  :title="row.original.fileName"
                >
                  {{ row.original.fileName }}
                </span>
              </template>

              <template #batchStatus-cell="{ row }">
                <UBadge
                  :color="batchStatusColor(row.original.status)"
                  variant="solid"
                  size="xs"
                  :icon="
                    row.original.status === 'uploading' ||
                    row.original.status === 'extracting'
                      ? 'i-lucide-loader-circle'
                      : undefined
                  "
                >
                  {{ batchStatusLabel(row.original.status) }}
                </UBadge>
              </template>
            </UTable>
          </div>
        </div>

        <div
          class="flex flex-wrap justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-arrow-left"
            label="Back to review"
            :disabled="batchImportRunning"
            @click="goToStep('review')"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="batchImportFinished"
              color="neutral"
              variant="outline"
              label="Back to conference"
              :to="conferenceManagementDetailPath(conferenceId)"
            />
            <UButton
              v-if="!batchImportRunning && !batchImportFinished"
              color="primary"
              icon="line-md:file-upload"
              label="Start import"
              @click="startImport"
            />
          </div>
        </div>
      </template>
    </div>
  </UCard>
</template>
