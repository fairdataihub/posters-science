<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";
import {
  ALLOWED_POSTER_FILE_LABEL,
  MAX_POSTER_FILE_SIZE_LABEL,
  POSTER_FILE_ACCEPT,
  posterFileRejectionReason,
} from "#shared/utils/posterFile";
import { BULK_EXTRACTION_LEVEL_OPTIONS } from "#shared/types/bulkExtractionLevel";
import type { BulkImportWizardStep } from "#shared/types/bulkImportWizard";
import { normalizeBulkImportWizardStep } from "#shared/types/bulkImportWizard";
import type { BulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import {
  DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD,
  normalizeBulkSubmissionExtractionMethod,
} from "#shared/types/bulkSubmission";
import type {
  BulkImportStagedPoster,
  BulkPosterSubmissionJob,
} from "#shared/types/bulkPosterSubmissionJob";
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
  syncBulkStagedPostersFromStorage,
  updateBulkPosterSubmissionJob,
  deleteAllBulkStagedPosters,
  deleteBulkStagedPoster,
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
  initialExtractionMethod?: BulkSubmissionExtractionMethod | string;
  initialStagedPosters?: BulkImportStagedPoster[];
  initialLicenseMetadataUploaded?: boolean;
  resumeLoading?: boolean;
}>();

const toast = useToast();

const stagedPosters = ref<BulkImportStagedPoster[]>([]);
const licenseMetadataUploaded = ref(
  props.initialLicenseMetadataUploaded ?? false,
);

const extractionMethod = ref<BulkSubmissionExtractionMethod>(
  normalizeBulkSubmissionExtractionMethod(
    props.initialExtractionMethod ?? DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD,
  ),
);
const fullExtractionAcknowledged = ref(
  normalizeBulkSubmissionExtractionMethod(props.initialExtractionMethod) ===
    "full_acknowledged",
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

function onPosterFilesRejected(rejections: { file: File; reason: string }[]) {
  const first = rejections[0];
  if (!first) return;

  toast.add({
    title: "File not accepted",
    description: `${first.file.name}: ${first.reason}`,
    color: "error",
  });
}

type PosterListRowStatus = "uploading" | "stored" | "error";

type PosterListRow = {
  id: string;
  fileName: string;
  filePath?: string;
  status: PosterListRowStatus;
  error?: string;
};

const posterFileUploadRef = ref<{ clearFiles: () => void } | null>(null);
const posterRowStatus = ref<
  Record<string, { status: "uploading" | "error"; error?: string }>
>({});
const activePosterUploads = ref(0);
const stagedPosterDeletePath = ref<string | null>(null);
const deleteAllPostersModalOpen = ref(false);
const deleteAllPostersLoading = ref(false);
const stagedPostersLoading = ref(false);
const resumeWizardHydrated = ref(false);
const resumeJobLoading = ref(false);

const posterUploadRunning = computed(() => activePosterUploads.value > 0);

const stagedPosterFileNames = computed(() =>
  stagedPosters.value.map((poster) => poster.fileName),
);

const posterListRows = computed((): PosterListRow[] => {
  const byKey = new Map<string, PosterListRow>();

  for (const poster of stagedPosters.value) {
    const rowStatus = posterRowStatus.value[poster.fileName];
    byKey.set(poster.fileName.toLowerCase(), {
      id: poster.filePath,
      fileName: poster.fileName,
      filePath: poster.filePath,
      status: rowStatus?.status === "uploading" ? "uploading" : "stored",
      error: rowStatus?.error,
    });
  }

  for (const [fileName, state] of Object.entries(posterRowStatus.value)) {
    const key = fileName.toLowerCase();
    if (byKey.has(key)) {
      const row = byKey.get(key)!;
      if (state.status === "uploading") row.status = "uploading";
      if (state.status === "error") {
        row.status = "error";
        row.error = state.error;
      }
      continue;
    }

    byKey.set(key, {
      id: `upload-${key}`,
      fileName,
      status: state.status,
      error: state.error,
    });
  }

  return [...byKey.values()].sort((a, b) =>
    a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" }),
  );
});

function clearPosterRowStatus(fileName: string) {
  const { [fileName]: _removed, ...rest } = posterRowStatus.value;
  posterRowStatus.value = rest;
}

async function onPosterFilesSelected(files: File[]) {
  if (files.length === 0) return;

  if (!jobId.value) {
    toast.add({
      title: "Name this import first",
      description:
        "Go back to step 1 and continue so uploads can be attached to your job.",
      color: "warning",
    });
    posterFileUploadRef.value?.clearFiles();
    return;
  }

  const batch = [...files];
  posterFileUploadRef.value?.clearFiles();

  for (const file of batch) {
    await uploadPosterFileImmediately(file);
  }
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

const canContinueFromUpload = computed(
  () => stagedPosters.value.length > 0 && !posterUploadRunning.value,
);

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
  restoreWizardStep,
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

const setupExtractionReady = computed(() => {
  if (extractionMethod.value !== "full_acknowledged") return true;
  return fullExtractionAcknowledged.value;
});

const setupCanContinue = computed(
  () => importNameValid.value && setupExtractionReady.value,
);

watch(
  () => props.initialJobId,
  (id) => {
    if (id) jobId.value = id;
  },
  { immediate: true },
);

watch(
  () => props.initialImportName,
  (name) => {
    if (typeof name === "string" && name.length > 0) {
      importName.value = name;
    }
  },
  { immediate: true },
);

watch(
  () => props.initialLicenseMetadataUploaded,
  (uploaded) => {
    if (uploaded) licenseMetadataUploaded.value = true;
  },
);

watch(
  () => props.initialExtractionMethod,
  (method) => {
    if (method) {
      extractionMethod.value = normalizeBulkSubmissionExtractionMethod(method);
    }
  },
);

watch(extractionMethod, (level) => {
  if (level !== "full_acknowledged") {
    fullExtractionAcknowledged.value = false;
  }
});

/** Hide poster list until job + Bunny sync finish (avoids stale rows on resume). */
const posterStorageListLoading = computed(
  () =>
    Boolean(props.resumeLoading) ||
    resumeJobLoading.value ||
    stagedPostersLoading.value ||
    (Boolean(props.initialJobId) && !resumeWizardHydrated.value),
);

function resolveResumeWizardStep(): BulkImportWizardStep {
  const fromProps = normalizeBulkImportWizardStep(props.initialStep);
  if (fromProps) return fromProps;
  return "setup";
}

function applyJobSnapshot(job: BulkPosterSubmissionJob) {
  jobId.value = job.id;
  importName.value = job.name;
  extractionMethod.value = normalizeBulkSubmissionExtractionMethod(
    job.extractionMethod,
  );
  fullExtractionAcknowledged.value =
    extractionMethod.value === "full_acknowledged";

  if (job.licenseMetadataFilePath) {
    licenseMetadataUploaded.value = true;
  }

  const step =
    normalizeBulkImportWizardStep(job.wizardStep) ?? resolveResumeWizardStep();

  restoreWizardStep(step);
}

async function hydrateListsAfterResume(step: BulkImportWizardStep) {
  if (step === "upload" || step === "metadata" || step === "review") {
    await refreshStagedPostersFromStorage();
  }
  if (step === "review" || step === "submit") {
    await refreshSubmissionRows();
  }
}

async function ensureResumeJobLoaded() {
  const id = props.initialJobId ?? jobId.value;
  if (!id || resumeJobLoading.value) return;

  resumeJobLoading.value = true;
  stagedPosters.value = [];

  try {
    const job = await getBulkPosterSubmissionJob(id);
    applyJobSnapshot(job);

    const step =
      normalizeBulkImportWizardStep(job.wizardStep) ??
      resolveResumeWizardStep();
    await hydrateListsAfterResume(step);

    resumeWizardHydrated.value = true;

    const path = shareNewBulkPath({ jobId: job.id });
    if (typeof path !== "string" && route.query.jobId !== job.id) {
      await router.replace(path);
    }
  } catch {
    resumeWizardHydrated.value = true;
  } finally {
    resumeJobLoading.value = false;
  }
}

watch(
  () => props.initialJobId,
  (id) => {
    if (!id) {
      resumeWizardHydrated.value = false;
      stagedPosters.value = [];
      return;
    }
    resumeWizardHydrated.value = false;
    void ensureResumeJobLoaded();
  },
  { immediate: true },
);

const currentStepTask = computed(
  () => wizardSteps.find((step) => step.id === currentStep.value)?.task ?? "",
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
    targetLeft =
      container.scrollLeft + (previousRect.left - containerRect.left);
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

async function refreshStagedPostersFromStorage() {
  if (!jobId.value || stagedPostersLoading.value) return;

  stagedPostersLoading.value = true;

  try {
    const result = await syncBulkStagedPostersFromStorage(jobId.value);
    stagedPosters.value = result.stagedPosters;
  } catch {
    try {
      const job = await getBulkPosterSubmissionJob(jobId.value);
      stagedPosters.value = job.stagedPosters ?? [];
    } catch {
      // Keep the last known list if sync and fetch both fail.
    }
  } finally {
    stagedPostersLoading.value = false;
  }
}

function goToStep(step: BulkImportWizardStep) {
  const moved = goToWizardStep(step, {
    beforeEnter: (target) => {
      if (target === "upload") {
        void refreshStagedPostersFromStorage();
      }
      if (target === "review") {
        void refreshSubmissionRows();
      }
    },
  });

  if (moved) {
    void persistWizardStep(step);
  }
}

watch(
  () => [jobId.value, currentStep.value] as const,
  ([id, step]) => {
    if (id && step === "upload") {
      void refreshStagedPostersFromStorage();
    }
  },
);

async function persistSetupJob(): Promise<string> {
  const name = importNameTrimmed.value;

  if (jobId.value) {
    try {
      const job = await updateBulkPosterSubmissionJob(jobId.value, {
        name,
        extractionMethod: extractionMethod.value,
      });
      return job.id;
    } catch (error) {
      if (fetchErrorStatusCode(error) !== 404) {
        throw error;
      }
      jobId.value = null;
    }
  }

  const job = await createBulkPosterSubmissionJob({
    name,
    extractionMethod: extractionMethod.value,
  });
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

  if (!continueAfterSetupPersisted()) return;

  void persistWizardStep("upload");

  if (!savedJobId) return;

  const path = shareNewBulkPath({ jobId: savedJobId });
  if (typeof path !== "string" && route.query.jobId !== savedJobId) {
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

function findStagedPosterByFileName(fileName: string) {
  return stagedPosters.value.find(
    (poster) =>
      poster.fileName.localeCompare(fileName, undefined, {
        sensitivity: "base",
      }) === 0,
  );
}

const duplicateReplaceModalOpen = ref(false);
const duplicateReplaceNames = ref<string[]>([]);
let duplicateReplaceResolve:
  | ((choice: "replace" | "skip" | "cancel") => void)
  | null = null;

function resolveDuplicateReplace(choice: "replace" | "skip" | "cancel") {
  if (!duplicateReplaceResolve) return;

  const resolve = duplicateReplaceResolve;
  duplicateReplaceResolve = null;
  duplicateReplaceModalOpen.value = false;
  resolve(choice);
}

function askDuplicateReplace(fileNames: string[]) {
  return new Promise<"replace" | "skip" | "cancel">((resolve) => {
    duplicateReplaceResolve = resolve;
    duplicateReplaceNames.value = fileNames;
    void nextTick(() => {
      duplicateReplaceModalOpen.value = true;
    });
  });
}

async function uploadPosterFileImmediately(file: File) {
  if (!jobId.value) return;

  const rejection = validatePosterUploadFile(file);
  if (rejection) {
    toast.add({
      title: "File not accepted",
      description: `${file.name}: ${rejection}`,
      color: "error",
    });
    return;
  }

  const existing = findStagedPosterByFileName(file.name);
  if (existing) {
    const choice = await askDuplicateReplace([file.name]);
    if (choice === "cancel" || choice === "skip") return;

    try {
      const { job } = await deleteBulkStagedPoster(
        jobId.value,
        existing.filePath,
      );
      stagedPosters.value = job.stagedPosters ?? [];
      clearPosterRowStatus(file.name);
    } catch (error) {
      toast.add({
        title: "Could not replace file",
        description:
          fetchErrorDescription(error) ??
          "The existing file could not be removed from storage.",
        color: "error",
      });
      return;
    }
  }

  posterRowStatus.value = {
    ...posterRowStatus.value,
    [file.name]: { status: "uploading" },
  };
  activePosterUploads.value += 1;

  try {
    const response = await uploadBulkPosterSubmissionFile(
      jobId.value,
      file,
      "poster",
    );
    stagedPosters.value = response.job.stagedPosters ?? stagedPosters.value;
    clearPosterRowStatus(file.name);
    void persistWizardStep("upload");
  } catch (error) {
    posterRowStatus.value = {
      ...posterRowStatus.value,
      [file.name]: {
        status: "error",
        error:
          fetchErrorDescription(error) ??
          (fetchErrorStatusCode(error) === 413
            ? `File is too large. Maximum size is ${MAX_POSTER_FILE_SIZE_LABEL}.`
            : "Upload failed"),
      },
    };
  } finally {
    activePosterUploads.value = Math.max(0, activePosterUploads.value - 1);
  }
}

function removeStagedPosterByPath(filePath: string) {
  const poster = stagedPosters.value.find(
    (entry) => entry.filePath === filePath,
  );
  if (poster) void removeStagedPoster(poster);
}

async function removeAllStagedPosters() {
  if (
    !jobId.value ||
    deleteAllPostersLoading.value ||
    posterUploadRunning.value
  ) {
    return;
  }

  deleteAllPostersLoading.value = true;

  try {
    const { job } = await deleteAllBulkStagedPosters(jobId.value);
    stagedPosters.value = job.stagedPosters ?? [];
    posterRowStatus.value = {};
    deleteAllPostersModalOpen.value = false;
    toast.add({
      title: "All posters removed",
      description: "Every staged poster file was deleted from this import.",
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Could not remove all posters",
      description:
        fetchErrorDescription(error) ??
        "Some files may still be in storage. Try again or remove them one by one.",
      color: "error",
    });
  } finally {
    deleteAllPostersLoading.value = false;
  }
}

async function removeStagedPoster(poster: BulkImportStagedPoster) {
  if (!jobId.value || stagedPosterDeletePath.value) return;

  stagedPosterDeletePath.value = poster.filePath;

  try {
    const { job } = await deleteBulkStagedPoster(jobId.value, poster.filePath);
    stagedPosters.value = job.stagedPosters ?? [];
    clearPosterRowStatus(poster.fileName);
  } catch (error) {
    toast.add({
      title: "Could not remove poster",
      description:
        fetchErrorDescription(error) ??
        "The file could not be deleted from storage. Try again.",
      color: "error",
    });
  } finally {
    stagedPosterDeletePath.value = null;
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
  const readyRows = submissionRows.value.filter(
    (row) => row.status === "ready",
  );
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

async function continueToMetadata() {
  if (posterUploadRunning.value) return;

  if (stagedPosters.value.length === 0) {
    toast.add({
      title: "Add poster files",
      description: "Drop or select at least one poster file before continuing.",
      color: "warning",
    });
    return;
  }

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
  <UCard class="flex flex-col" :ui="{ header: 'overflow-visible' }">
    <template #header>
      <div class="flex flex-col gap-4 overflow-visible">
        <h2 class="text-lg font-semibold">{{ headerTitle }}</h2>

        <nav
          aria-label="Bulk import progress"
          class="relative min-w-0 overflow-visible"
        >
          <ol
            ref="stepperScrollRef"
            class="flex [scrollbar-width:thin] flex-row items-start gap-3 overflow-x-auto overflow-y-visible overscroll-x-contain scroll-smooth px-0.5 py-1.5 pb-2"
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
      <p
        v-if="resumeLoading || resumeJobLoading"
        class="text-muted text-center text-sm"
        aria-live="polite"
      >
        Loading your import…
      </p>

      <template v-if="currentStep === 'setup'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Name
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
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

          <UFormField label="How should we get poster details?" required>
            <div
              class="space-y-3"
              role="radiogroup"
              aria-label="How should we get poster details?"
            >
              <label
                v-for="option in BULK_EXTRACTION_LEVEL_OPTIONS"
                :key="option.value"
                class="flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors"
                :class="
                  extractionMethod === option.value
                    ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
                    : 'border-gray-200 dark:border-gray-800'
                "
              >
                <input
                  v-model="extractionMethod"
                  type="radio"
                  class="mt-1 shrink-0"
                  name="bulk-extraction-level"
                  :value="option.value"
                />

                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm font-semibold">{{
                      option.label
                    }}</span>
                    <UBadge
                      v-if="option.badge"
                      color="primary"
                      variant="soft"
                      size="xs"
                    >
                      {{ option.badge }}
                    </UBadge>
                  </div>
                  <p class="text-muted text-sm">{{ option.description }}</p>
                </div>
              </label>
            </div>
          </UFormField>

          <UCheckbox
            v-if="extractionMethod === 'full_acknowledged'"
            v-model="fullExtractionAcknowledged"
            label="I’m okay with less manual review on extracted fields (I can still edit before publishing)."
          />
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
            :disabled="!setupCanContinue"
            :loading="setupSaving"
            @click="commitSetupAndContinue"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'upload'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Posters
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
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
              ref="posterFileUploadRef"
              hide-file-list
              multiple
              :accept="POSTER_FILE_ACCEPT"
              :validate-file="validatePosterUploadFile"
              :hint="`${POSTER_ONLY_HINT} Files upload as soon as you add them.`"
              @on-change="onPosterFilesSelected"
              @on-reject="onPosterFilesRejected"
            >
              <UiFileUploadGrid />
            </UiFileUpload>

            <div
              v-if="posterStorageListLoading || posterListRows.length > 0"
              class="space-y-2"
            >
              <div
                v-if="posterStorageListLoading"
                class="flex flex-col items-center justify-center gap-2 py-10"
                aria-live="polite"
                aria-busy="true"
              >
                <UIcon
                  name="i-lucide-loader-circle"
                  class="text-primary size-8 animate-spin"
                />
                <p class="text-muted text-sm">Loading poster files…</p>
              </div>

              <template v-else>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-medium">
                    {{ stagedPosters.length }} poster(s) added to this import
                  </p>
                  <UButton
                    v-if="stagedPosters.length > 0"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    icon="i-lucide-trash-2"
                    label="Delete all"
                    :disabled="
                      !jobId ||
                      posterUploadRunning ||
                      stagedPosterDeletePath !== null ||
                      deleteAllPostersLoading
                    "
                    :loading="deleteAllPostersLoading"
                    @click="deleteAllPostersModalOpen = true"
                  />
                </div>
                <ul
                  v-if="posterListRows.length > 0"
                  class="border-default divide-default max-h-[320px] divide-y overflow-y-auto rounded-md border"
                >
                  <li
                    v-for="row in posterListRows"
                    :key="row.id"
                    class="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
                  >
                    <span class="min-w-0 truncate" :title="row.fileName">
                      {{ row.fileName }}
                    </span>
                    <div class="flex shrink-0 items-center gap-1">
                      <UBadge
                        :color="
                          row.status === 'stored'
                            ? 'success'
                            : row.status === 'uploading'
                              ? 'info'
                              : 'error'
                        "
                        variant="soft"
                        size="xs"
                      >
                        {{
                          row.status === "stored"
                            ? "Stored"
                            : row.status === "uploading"
                              ? "Uploading…"
                              : (row.error ?? "Failed")
                        }}
                      </UBadge>
                      <UButton
                        v-if="row.filePath"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-trash-2"
                        aria-label="Remove from storage"
                        :disabled="
                          !jobId ||
                          posterUploadRunning ||
                          stagedPosterDeletePath !== null
                        "
                        :loading="stagedPosterDeletePath === row.filePath"
                        @click="removeStagedPosterByPath(row.filePath)"
                      />
                    </div>
                  </li>
                </ul>
              </template>
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
            :disabled="
              !canContinueFromUpload || !jobId || posterStorageListLoading
            "
            :loading="posterUploadRunning"
            @click="continueToMetadata"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'metadata'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Licenses
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
              <template v-if="extractionMethod === 'minimal'">
                You can also add title, authors, and other columns in the CSV—we
                won’t overwrite what you type.
              </template>
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
              Step {{ currentStepNumber }}: Check
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
            </p>
          </div>

          <UAlert
            color="info"
            variant="soft"
            icon="i-lucide-info"
            title="Posters already in storage"
            description="Each spreadsheet row should match one uploaded file name and include a license. Fix warnings before you import."
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
              Step {{ currentStepNumber }}: Finish
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
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
              label="Start import"
              @click="startImport"
            />
          </div>
        </div>
      </template>
    </div>
  </UCard>

  <UModal
    v-model:open="deleteAllPostersModalOpen"
    title="Delete all staged posters?"
    description="This removes every poster file from storage for this bulk import."
    class="max-w-md"
  >
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        label="Cancel"
        :disabled="deleteAllPostersLoading"
        @click="deleteAllPostersModalOpen = false"
      />
      <UButton
        color="error"
        label="Delete all"
        :loading="deleteAllPostersLoading"
        @click="removeAllStagedPosters"
      />
    </template>
  </UModal>

  <UModal
    v-model:open="duplicateReplaceModalOpen"
    :dismissible="false"
    title="Replace files already in storage?"
    description="These poster file names are already saved for this import."
    class="max-w-md"
  >
    <template #body>
      <ul
        class="border-default divide-default max-h-48 divide-y overflow-y-auto rounded-md border text-sm"
      >
        <li
          v-for="name in duplicateReplaceNames"
          :key="name"
          class="truncate px-3 py-2"
          :title="name"
        >
          {{ name }}
        </li>
      </ul>
      <p class="text-muted mt-3 text-sm">
        Replace removes the stored copy and uploads your newly selected file.
        Keep existing skips uploading those names.
      </p>
    </template>

    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        label="Cancel"
        @click="resolveDuplicateReplace('cancel')"
      />
      <UButton
        color="neutral"
        variant="soft"
        label="Keep existing"
        @click="resolveDuplicateReplace('skip')"
      />
      <UButton
        color="primary"
        label="Replace"
        @click="resolveDuplicateReplace('replace')"
      />
    </template>
  </UModal>
</template>
