<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";
import {
  ALLOWED_POSTER_FILE_LABEL,
  MAX_POSTER_FILE_SIZE_LABEL,
  POSTER_FILE_ACCEPT,
  posterFileRejectionReason,
} from "#shared/utils/posterFile";
import type { BulkImportWizardStep } from "#shared/types/bulkImportWizard";
import { normalizeBulkImportWizardStep } from "#shared/types/bulkImportWizard";
import type { BulkImportStagedPoster } from "#shared/types/bulkPosterSubmissionJob";
import {
  CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME,
  type BulkImportBatchItem,
  type BulkImportBatchItemStatus,
  type BulkImportSubmissionRow,
} from "#shared/types/conferenceBulkImport";
import {
  buildSubmissionRowsFromSeparateUpload,
  countSubmissionRowsByStatus,
  submissionRowStatusColor,
  submissionRowStatusLabel,
} from "~/utils/conferenceBulkImportSubmissions";
import {
  conferenceImportSpreadsheetCsvFromFileNames,
  readConferenceImportSpreadsheetFile,
  type ConferenceImportSpreadsheetRow,
} from "~/utils/conferenceImportSpreadsheet";
import {
  createBulkPosterSubmissionJob,
  getBulkPosterSubmissionJob,
  updateBulkPosterSubmissionJob,
  uploadBulkPosterSubmissionFile,
} from "~/utils/bulkPosterSubmissionJobClient";
import { shareNewBulkPath } from "~/utils/sharePaths";

const router = useRouter();
const route = useRoute();

function fetchErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }
  if (
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "statusCode" in error.data &&
    typeof (error.data as { statusCode: unknown }).statusCode === "number"
  ) {
    return (error.data as { statusCode: number }).statusCode;
  }
  return undefined;
}

function fetchErrorDescription(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("data" in error && error.data && typeof error.data === "object") {
    const data = error.data as { message?: string; statusMessage?: string };
    return data.message ?? data.statusMessage;
  }
  if ("statusMessage" in error && typeof error.statusMessage === "string") {
    return error.statusMessage;
  }
  return undefined;
}

const props = defineProps<{
  initialJobId?: string;
  initialImportName?: string;
  initialStep?: BulkImportWizardStep | "assets";
  initialStagedPosters?: BulkImportStagedPoster[];
  initialLicenseMetadataUploaded?: boolean;
}>();

const toast = useToast();

const stagedPosters = ref<BulkImportStagedPoster[]>(
  props.initialStagedPosters ?? [],
);
const licenseMetadataUploaded = ref(
  props.initialLicenseMetadataUploaded ?? false,
);

const POSTER_ONLY_HINT = `${ALLOWED_POSTER_FILE_LABEL}, up to ${MAX_POSTER_FILE_SIZE_LABEL} per file`;

const validatePosterFile = (file: File) =>
  posterFileRejectionReason({
    name: file.name,
    type: file.type,
    size: file.size,
  });

function validatePosterUploadFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".zip")) {
    return "Upload poster PDFs or images individually — ZIP bundles are not used in this step.";
  }
  return validatePosterFile(file);
}

type PosterUploadQueueItem = {
  id: string;
  fileName: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

const posterUploadQueue = ref<PosterUploadQueueItem[]>([]);
const posterUploadRunning = ref(false);
const pendingPosterFiles = ref<File[]>([]);

const stagedPosterFileNames = computed(() =>
  stagedPosters.value.map((poster) => poster.fileName),
);

function onPendingPosterFilesChange(files: File[]) {
  pendingPosterFiles.value = files;
}

function validateLicenseMetadataFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".csv")) {
    return `Upload ${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv (CSV format).`;
  }
  return null;
}

const licenseMetadataLocalFile = ref<File[]>([]);
const licenseMetadataParseError = ref<string | null>(null);

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

const uploadStepComplete = computed(() => stagedPosters.value.length > 0);

const metadataStepComplete = computed(() => licenseMetadataUploaded.value);

const canProceedFromReview = computed(() => {
  if (submissionRows.value.length === 0) return false;
  return submissionRows.value.every((row) => row.status === "ready");
});

const {
  wizardSteps,
  currentStep,
  currentStepNumber,
  importName,
  importNameTrimmed,
  importNameValid,
  jobId,
  headerTitle,
  canGoToStep,
  stepIsDone,
  stepIsActive,
  goToStep: goToWizardStep,
  continueAfterSetupPersisted,
  BULK_IMPORT_NAME_MAX_LENGTH,
  BULK_IMPORT_NAME_MIN_LENGTH,
} = useBulkImportWizard(
  {
    upload: uploadStepComplete,
    metadata: metadataStepComplete,
    review: canProceedFromReview,
  },
  {
    initialJobId: props.initialJobId,
    initialImportName: props.initialImportName,
    initialStep: normalizeBulkImportWizardStep(props.initialStep),
  },
);

watch(
  () => props.initialJobId,
  (id) => {
    if (id) jobId.value = id;
  },
);

watch(
  () => props.initialImportName,
  (name) => {
    if (name) importName.value = name;
  },
);

watch(
  () => props.initialStagedPosters,
  (posters) => {
    if (posters && posters.length > 0) {
      stagedPosters.value = posters;
    }
  },
  { deep: true },
);

watch(
  () => props.initialLicenseMetadataUploaded,
  (uploaded) => {
    if (uploaded) licenseMetadataUploaded.value = true;
  },
);

const setupSaving = ref(false);

const stepperScrollRef = ref<HTMLElement | null>(null);
const stepItemEls = ref<(HTMLElement | null)[]>([]);

function setStepItemEl(el: unknown, index: number) {
  stepItemEls.value[index] = el instanceof HTMLElement ? el : null;
}

/** Keep the active step in the second slot: one prior step visible, rest ahead. */
function scrollActiveStepToSecondSlot(behavior: ScrollBehavior = "smooth") {
  const container = stepperScrollRef.value;
  if (!container) return;

  const activeIndex = wizardSteps.findIndex(
    (step) => step.id === currentStep.value,
  );
  if (activeIndex < 0) return;

  const previousEl =
    activeIndex > 0 ? stepItemEls.value[activeIndex - 1] : null;

  let targetLeft = 0;

  if (previousEl) {
    const containerRect = container.getBoundingClientRect();
    const previousRect = previousEl.getBoundingClientRect();
    targetLeft = container.scrollLeft + (previousRect.left - containerRect.left);
  }

  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  container.scrollTo({
    left: Math.min(Math.max(0, targetLeft), maxScroll),
    behavior,
  });
}

watch(currentStep, () => {
  nextTick(() => scrollActiveStepToSecondSlot());
});

onMounted(() => {
  nextTick(() => scrollActiveStepToSecondSlot("instant"));
});

async function persistWizardStep(step: BulkImportWizardStep) {
  if (!jobId.value) return;

  try {
    await updateBulkPosterSubmissionJob(jobId.value, { wizardStep: step });
  } catch {
    toast.add({
      title: "Could not save progress",
      description: "Your step change was not saved. Try again in a moment.",
      color: "warning",
    });
  }
}

function goToStep(step: BulkImportWizardStep) {
  const moved = goToWizardStep(step, {
    beforeEnter: (target) => {
      if (target === "review") {
        void refreshSubmissionRows();
      }
    },
  });

  if (moved) {
    void persistWizardStep(step);
  }
}

async function persistSetupJob(): Promise<string> {
  const name = importNameTrimmed.value;

  if (jobId.value) {
    try {
      const job = await updateBulkPosterSubmissionJob(jobId.value, {
        name,
        wizardStep: "upload",
      });
      return job.id;
    } catch (error) {
      if (fetchErrorStatusCode(error) !== 404) {
        throw error;
      }
      jobId.value = null;
    }
  }

  const job = await createBulkPosterSubmissionJob({ name });
  jobId.value = job.id;
  return job.id;
}

async function commitSetupAndContinue() {
  if (!importNameValid.value || setupSaving.value) return;

  setupSaving.value = true;

  let savedJobId: string | undefined;

  try {
    savedJobId = await persistSetupJob();
  } catch (error) {
    toast.add({
      title: "Could not start import",
      description:
        fetchErrorDescription(error) ??
        "We could not save this bulk import. Please try again.",
      color: "error",
    });
    return;
  } finally {
    setupSaving.value = false;
  }

  continueAfterSetupPersisted();

  const path = shareNewBulkPath({ jobId: savedJobId });
  if (typeof path === "string") {
    if (route.fullPath !== path) {
      await router.replace(path);
    }
  } else if (route.query.jobId !== savedJobId) {
    await router.replace(path);
  }
}

async function refreshSubmissionRows() {
  submissionLoading.value = true;

  try {
    const metadataFile = licenseMetadataLocalFile.value[0];
    if (metadataFile) {
      const parsed = await readConferenceImportSpreadsheetFile(metadataFile);
      if (parsed.error) {
        licenseMetadataParseError.value = parsed.error;
        submissionRows.value = [];
        return;
      }

      licenseMetadataParseError.value = null;
      submissionRows.value = buildSubmissionRowsFromSeparateUpload({
        spreadsheetRows: parsed.rows,
        posterFileNames: stagedPosterFileNames.value,
      });
      return;
    }

    if (!jobId.value) {
      submissionRows.value = [];
      return;
    }

    const job = await getBulkPosterSubmissionJob(jobId.value);
    const summary = job.submissionSummary as
      | { licenseSpreadsheetRows?: ConferenceImportSpreadsheetRow[] }
      | null
      | undefined;

    if (summary?.licenseSpreadsheetRows?.length) {
      submissionRows.value = buildSubmissionRowsFromSeparateUpload({
        spreadsheetRows: summary.licenseSpreadsheetRows,
        posterFileNames: stagedPosterFileNames.value,
      });
      return;
    }

    submissionRows.value = [];
  } finally {
    submissionLoading.value = false;
  }
}

async function uploadPendingPosters() {
  if (!jobId.value || posterUploadRunning.value) return;

  const files = pendingPosterFiles.value;
  if (files.length === 0) return;

  posterUploadRunning.value = true;
  posterUploadQueue.value = files.map((file, index) => ({
    id: `${file.name}-${index}`,
    fileName: file.name,
    status: "pending" as const,
  }));

  let successCount = 0;

  for (const item of posterUploadQueue.value) {
    const file = files.find((entry) => entry.name === item.fileName);
    if (!file) continue;

    item.status = "uploading";

    try {
      const response = await uploadBulkPosterSubmissionFile(
        jobId.value,
        file,
        "poster",
      );
      stagedPosters.value = response.job.stagedPosters ?? [];
      item.status = "done";
      successCount += 1;
    } catch {
      item.status = "error";
      item.error = "Upload failed";
    }
  }

  posterUploadRunning.value = false;
  pendingPosterFiles.value = [];

  if (successCount > 0) {
    toast.add({
      title: "Posters stored",
      description: `${successCount} file(s) uploaded to secure storage for this import.`,
      color: "success",
    });
    void persistWizardStep("upload");
  } else {
    toast.add({
      title: "Upload failed",
      description: "None of the selected posters could be uploaded. Try again.",
      color: "error",
    });
  }
}

async function uploadLicenseMetadata() {
  if (!jobId.value) return;

  const file = licenseMetadataLocalFile.value[0];
  if (!file) return;

  const parsed = await readConferenceImportSpreadsheetFile(file);
  if (parsed.error) {
    licenseMetadataParseError.value = parsed.error;
    toast.add({
      title: "Invalid metadata file",
      description: parsed.error,
      color: "warning",
    });
    return;
  }

  try {
    const response = await uploadBulkPosterSubmissionFile(
      jobId.value,
      file,
      "license_metadata",
    );
    licenseMetadataUploaded.value = Boolean(
      response.job.licenseMetadataFilePath,
    );
    await updateBulkPosterSubmissionJob(jobId.value, {
      submissionSummary: { licenseSpreadsheetRows: parsed.rows },
    });
    toast.add({
      title: "License metadata saved",
      description: `${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv is stored with this import.`,
      color: "success",
    });
    void persistWizardStep("metadata");
    await refreshSubmissionRows();
  } catch {
    toast.add({
      title: "Could not upload metadata",
      description: "Check the file format and try again.",
      color: "error",
    });
  }
}

function downloadLicenseMetadataTemplate() {
  const csv = conferenceImportSpreadsheetCsvFromFileNames(
    stagedPosterFileNames.value,
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function onLicenseMetadataLocalChange(files: File[]) {
  licenseMetadataLocalFile.value = files;
  licenseMetadataUploaded.value = false;
  licenseMetadataParseError.value = null;
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

const expectedBatchCount = computed(
  () => submissionRows.value.filter((row) => row.status === "ready").length,
);

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
  const readyRows = submissionRows.value.filter((row) => row.status === "ready");
  return readyRows.map((row, index) => ({
    id: `bulk-sim-${index + 1}`,
    fileName: row.fileName,
    status: "queued" as const,
  }));
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

function continueToMetadata() {
  if (!uploadStepComplete.value) return;
  goToStep("metadata");
}

function continueToReview() {
  if (!metadataStepComplete.value) return;
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

</script>

<template>
  <UCard
    class="flex flex-col"
    :ui="{ header: 'overflow-visible' }"
  >
    <template #header>
      <div class="flex flex-col gap-4 overflow-visible">
        <h2 class="text-lg font-semibold">{{ headerTitle }}</h2>

        <nav
          aria-label="Bulk import progress"
          class="relative min-w-0 overflow-visible"
        >
          <ol
            ref="stepperScrollRef"
            class="flex flex-row items-start gap-3 overflow-x-auto overflow-y-visible overscroll-x-contain scroll-smooth px-0.5 py-1.5 pb-2 [scrollbar-width:thin]"
          >
            <li
              v-for="(step, index) in wizardSteps"
              :key="step.id"
              :ref="(el) => setStepItemEl(el, index)"
              class="w-[12.5rem] shrink-0 sm:w-[14rem]"
            >
              <button
                type="button"
                class="hover:bg-muted/40 flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                :class="
                  stepIsActive(step.id)
                    ? 'bg-muted/30 ring-primary/30 ring-1 ring-inset'
                    : ''
                "
                :aria-current="stepIsActive(step.id) ? 'step' : undefined"
                :disabled="!canGoToStep(step.id)"
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
      <template v-if="currentStep === 'setup'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Name this bulk import
            </h3>
            <p class="text-muted mt-1 text-sm">
              Choose a label you will recognize on your dashboard. You can pause
              and return to this import later once progress saving is enabled.
            </p>
          </div>

          <UFormField
            label="Import name"
            required
            :hint="`${BULK_IMPORT_NAME_MIN_LENGTH}–${BULK_IMPORT_NAME_MAX_LENGTH} characters`"
          >
            <UInput
              v-model="importName"
              placeholder="e.g. Spring 2026 poster batch"
              :maxlength="BULK_IMPORT_NAME_MAX_LENGTH"
              autocomplete="off"
            />
          </UFormField>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            label="Back to dashboard"
            to="/dashboard"
          />
          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Continue to upload posters"
            :disabled="!importNameValid"
            :loading="setupSaving"
            @click="commitSetupAndContinue"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'upload'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Upload poster files
            </h3>
            <p class="text-muted mt-1 text-sm">
              Upload each poster PDF or image to secure storage first. You will
              add license and extraction metadata in the next step, then send
              everything to the extraction pipeline.
            </p>
          </div>

          <UAlert
            v-if="!jobId"
            color="warning"
            variant="soft"
            icon="i-lucide-alert-triangle"
            title="Name this import first"
            description="Go back to step 1 and continue so we can attach uploads to your bulk import job."
          />

          <div
            class="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
          >
            <UiFileUpload
              hide-file-list
              hide-rejections
              multiple
              :accept="POSTER_FILE_ACCEPT"
              :validate-file="validatePosterUploadFile"
              :hint="POSTER_ONLY_HINT"
              @on-change="onPendingPosterFilesChange"
            >
              <UiFileUploadGrid />
            </UiFileUpload>

            <UButton
              v-if="pendingPosterFiles.length > 0"
              color="primary"
              icon="line-md:cloud-upload-loop"
              :label="`Upload ${pendingPosterFiles.length} poster(s) to storage`"
              :loading="posterUploadRunning"
              :disabled="!jobId"
              @click="uploadPendingPosters"
            />

            <ul
              v-if="posterUploadQueue.length > 0"
              class="border-default divide-default divide-y rounded-md border text-sm"
            >
              <li
                v-for="item in posterUploadQueue"
                :key="item.id"
                class="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span class="truncate" :title="item.fileName">{{
                  item.fileName
                }}</span>
                <UBadge
                  :color="
                    item.status === 'done'
                      ? 'success'
                      : item.status === 'error'
                        ? 'error'
                        : item.status === 'uploading'
                          ? 'info'
                          : 'neutral'
                  "
                  variant="soft"
                  size="xs"
                >
                  {{
                    item.status === "done"
                      ? "Stored"
                      : item.status === "error"
                        ? item.error ?? "Failed"
                        : item.status === "uploading"
                          ? "Uploading…"
                          : "Queued"
                  }}
                </UBadge>
              </li>
            </ul>

            <div v-if="stagedPosters.length > 0" class="space-y-2">
              <p class="text-sm font-medium">
                {{ stagedPosters.length }} poster(s) in this import
              </p>
              <ul
                class="border-default divide-default max-h-[320px] divide-y overflow-y-auto rounded-md border"
              >
                <li
                  v-for="poster in stagedPosters"
                  :key="poster.filePath"
                  class="truncate px-3 py-1.5 text-sm"
                  :title="poster.fileName"
                >
                  {{ poster.fileName }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            label="Back"
            @click="goToStep('setup')"
          />
          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Continue to metadata"
            :disabled="!uploadStepComplete"
            @click="continueToMetadata"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'metadata'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Licenses &amp; metadata
            </h3>
            <p class="text-muted mt-1 text-sm">
              Download a CSV template listing your uploaded poster file names,
              fill in an SPDX license for each row, then upload the completed
              file. Additional metadata sheets for extraction can be added here
              later.
            </p>
          </div>

          <div
            class="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
          >
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-file-spreadsheet"
                :disabled="stagedPosters.length === 0"
                :label="`Download ${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv template`"
                @click="downloadLicenseMetadataTemplate"
              />
              <span class="text-muted text-xs">
                {{ stagedPosters.length }} poster file name(s) from step
                {{ currentStepNumber - 1 }}
              </span>
            </div>

            <UiFileUpload
              hide-file-list
              hide-rejections
              :accept="'.csv,text/csv'"
              :validate-file="validateLicenseMetadataFile"
              :hint="`Completed ${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv`"
              @on-change="onLicenseMetadataLocalChange"
            >
              <UiFileUploadGrid />
            </UiFileUpload>

            <UButton
              v-if="licenseMetadataLocalFile.length > 0"
              color="primary"
              icon="line-md:cloud-upload-loop"
              label="Upload license metadata to storage"
              :disabled="!jobId"
              @click="uploadLicenseMetadata"
            />

            <UAlert
              v-if="licenseMetadataUploaded"
              color="success"
              variant="soft"
              icon="i-lucide-circle-check"
              title="Metadata stored"
              :description="`${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv is saved with this import on secure storage.`"
            />

            <UAlert
              v-if="licenseMetadataParseError"
              color="warning"
              variant="soft"
              icon="i-lucide-alert-triangle"
              title="Could not read metadata file"
              :description="licenseMetadataParseError"
            />
          </div>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            label="Back"
            @click="goToStep('upload')"
          />
          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Continue to review"
            :disabled="!metadataStepComplete"
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
            title="Posters already in storage"
            description="Each row matches an uploaded poster file name with license metadata. Fix any warnings before starting extraction."
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
            @click="goToStep('metadata')"
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
              Step {{ currentStepNumber }}: Extraction pipeline
            </h3>
            <p class="text-muted mt-1 text-sm">
              Start extraction for each poster that passed review. Files are
              already in storage; this step creates poster records and runs the
              same pipeline as single-poster share.
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
            description="When this is wired up, posters will appear on your dashboard as they finish processing."
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
              label="Back to dashboard"
              to="/dashboard"
            />
            <UButton
              v-if="!batchImportRunning && !batchImportFinished"
              color="primary"
              icon="line-md:file-upload"
              label="Start extraction"
              @click="startImport"
            />
          </div>
        </div>
      </template>
    </div>
  </UCard>
</template>
