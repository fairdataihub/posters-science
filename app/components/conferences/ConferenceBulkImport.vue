<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";
import {
  ALLOWED_POSTER_FILE_LABEL,
  MAX_POSTER_FILE_SIZE_LABEL,
  POSTER_FILE_ACCEPT,
  posterFileRejectionReason,
} from "#shared/utils/posterFile";
import { BULK_EXTRACTION_LEVEL_OPTIONS } from "#shared/types/bulkExtractionLevel";
import {
  applyBulkImportConferenceToForm,
  BULK_IMPORT_CONFERENCE_ATTENDANCE_OPTIONS,
  bulkImportConferenceFormValid,
  bulkImportConferenceFromForm,
  conferenceDateRangeFieldErrors,
  emptyBulkImportConferenceForm,
  syncConferenceYearFromStartDate,
  type BulkImportConferenceFormState,
} from "#shared/types/bulkImportConference";
import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import {
  DEFAULT_BULK_IMPORT_REVIEW_EMBARGO_DAYS,
  type BulkImportReviewEmbargoChoice,
} from "#shared/types/bulkImportReviewEmbargo";
import { BULK_IMPORT_ACCEPTABLE_LICENSES } from "#shared/data/bulkImportAcceptableLicenses";
import identifierTypes from "@/assets/data/identifier-types.json";
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
  type BulkImportBatchItem,
  type BulkImportBatchItemStatus,
  type BulkImportSubmissionRow,
} from "#shared/types/conferenceBulkImport";
import { buildSubmissionRowsFromSeparateUpload } from "~/utils/conferenceBulkImportSubmissions";
import { buildSpreadsheetRowsForUniformLicense } from "~/utils/conferenceImportSpreadsheet";
import {
  createBulkPosterSubmissionJob,
  getBulkPosterSubmissionJob,
  syncBulkStagedPostersFromStorage,
  updateBulkPosterSubmissionJob,
  deleteAllBulkStagedPosters,
  deleteBulkStagedPoster,
  uploadBulkPosterSubmissionFile,
  submitBulkPosterSubmissionJob,
  applyBulkSubmissionMetadataToPosters,
  discardFailedBulkExtractions,
} from "~/utils/bulkPosterSubmissionJobClient";
import { shareNewBulkPath } from "~/utils/sharePaths";
import BulkImportMetadataReview from "~/components/conferences/BulkImportMetadataReview.vue";
import BulkImportSpreadsheetStep from "~/components/conferences/BulkImportSpreadsheetStep.vue";
import BulkImportPosterJsonPreview from "~/components/conferences/BulkImportPosterJsonPreview.vue";
import BulkImportPublishStep from "~/components/conferences/BulkImportPublishStep.vue";

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
  resumeLoading?: boolean;
}>();

const toast = useToast();

const stagedPosters = ref<BulkImportStagedPoster[]>([]);

const extractionMethod = ref<BulkSubmissionExtractionMethod>(
  normalizeBulkSubmissionExtractionMethod(
    props.initialExtractionMethod ?? DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD,
  ),
);

type OrcidRorAutomationChoice = "yes" | "no";

const orcidRorAutomationChoice = ref<OrcidRorAutomationChoice | undefined>(
  undefined,
);

const orcidRorAutomationItems: {
  label: string;
  value: OrcidRorAutomationChoice;
}[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

const reviewEmbargoChoice = ref<BulkImportReviewEmbargoChoice | undefined>(
  undefined,
);

const reviewEmbargoItems: {
  label: string;
  value: BulkImportReviewEmbargoChoice;
}[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

function isExtractionLevelSelected(value: BulkSubmissionExtractionMethod) {
  return extractionMethod.value === value;
}

function onExtractionLevelCheckbox(
  value: BulkSubmissionExtractionMethod,
  checked: boolean,
) {
  if (!checked) return;

  const option = BULK_EXTRACTION_LEVEL_OPTIONS.find(
    (item) => item.value === value,
  );
  if (option?.disabled) return;

  extractionMethod.value = value;
}

watch(
  extractionMethod,
  (method) => {
    const option = BULK_EXTRACTION_LEVEL_OPTIONS.find(
      (item) => item.value === method,
    );
    if (option?.disabled) {
      extractionMethod.value = "full";
    }
  },
  { immediate: true },
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
    return "Upload poster PDFs or images individually. ZIP bundles are not used in this step.";
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
const posterUploadQueueTotal = ref(0);
const posterUploadQueueFinished = ref(0);
const currentPosterFileUploadPercent = ref(0);
const stagedPosterDeletePath = ref<string | null>(null);
const deleteAllPostersModalOpen = ref(false);
const deleteAllPostersLoading = ref(false);
const discardFailedConfirmOpen = ref(false);
const stagedPostersLoading = ref(false);
const resumeWizardHydrated = ref(false);
const resumeJobLoading = ref(false);

const posterUploadRunning = computed(() => activePosterUploads.value > 0);

const posterUploadProgressVisible = computed(
  () => posterUploadQueueTotal.value > 0,
);

const posterUploadOverallPercent = computed(() => {
  const total = posterUploadQueueTotal.value;
  if (total === 0) return 0;

  const completed = posterUploadQueueFinished.value;
  const currentFileFraction = posterUploadRunning.value
    ? currentPosterFileUploadPercent.value / 100
    : 0;

  return Math.min(
    100,
    Math.round(((completed + currentFileFraction) / total) * 100),
  );
});

const posterUploadProgressLabel = computed(() => {
  const total = posterUploadQueueTotal.value;
  if (total === 0) return "";

  const completed = posterUploadQueueFinished.value;
  const inFlight = posterUploadRunning.value ? 1 : 0;
  const currentFile = Math.min(completed + inFlight, total);

  return `${currentFile} of ${total} file${total === 1 ? "" : "s"}`;
});

function resetPosterUploadProgressIfIdle() {
  if (activePosterUploads.value > 0) return;

  if (
    posterUploadQueueTotal.value > 0 &&
    posterUploadQueueFinished.value >= posterUploadQueueTotal.value
  ) {
    posterUploadQueueTotal.value = 0;
    posterUploadQueueFinished.value = 0;
    currentPosterFileUploadPercent.value = 0;
  }
}

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

  posterUploadQueueTotal.value += batch.length;

  for (const file of batch) {
    currentPosterFileUploadPercent.value = 0;
    await uploadPosterFileImmediately(file);
    posterUploadQueueFinished.value += 1;
    currentPosterFileUploadPercent.value = 0;
  }

  resetPosterUploadProgressIfIdle();
}

const uniformLicense = ref<string>("");

const uniformLicenseOptions = computed(() => BULK_IMPORT_ACCEPTABLE_LICENSES);

const uniformLicenseSelectItems = computed(() =>
  uniformLicenseOptions.value.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);

const submissionRows = ref<BulkImportSubmissionRow[]>([]);
const submissionLoading = ref(false);

const uploadStepComplete = computed(() => stagedPosters.value.length > 0);

const canContinueFromUpload = computed(
  () => stagedPosters.value.length > 0 && !posterUploadRunning.value,
);

const extractionStepAcknowledged = ref(false);

const extractionStepReady = computed(
  () =>
    orcidRorAutomationChoice.value !== undefined &&
    reviewEmbargoChoice.value !== undefined,
);

const extractionStepComplete = computed(
  () => extractionStepAcknowledged.value && extractionStepReady.value,
);

const extractionStepSaving = ref(false);

const canProceedFromReview = computed(() => {
  if (submissionRows.value.length === 0) return false;
  return submissionRows.value.every((row) => row.status === "ready");
});

const conferenceIdentifierTypeOptions = identifierTypes.map((entry) => ({
  label: entry.label,
  value: entry.value,
}));

const conferenceForm = reactive<BulkImportConferenceFormState>(
  emptyBulkImportConferenceForm(),
);
const conferenceStepAttempted = ref(false);
const conferenceStepSaving = ref(false);
const licenseStepAttempted = ref(false);
const licenseStepSaving = ref(false);

const showConferenceIdentifierDetails = computed(
  () => conferenceForm.conferenceIdentifier.trim().length > 0,
);

const conferenceStepComplete = computed(() =>
  bulkImportConferenceFormValid(conferenceForm),
);

const licenseStepComplete = computed(() =>
  Boolean(uniformLicense.value.trim()),
);

watch(
  () => conferenceForm.conferenceIdentifier,
  (identifier) => {
    if (!identifier.trim()) {
      conferenceForm.conferenceIdentifierType = "";
      conferenceForm.conferenceSchemaUri = "";
    }
  },
);

watch(
  () => conferenceForm.conferenceAttendance,
  (attendance) => {
    if (attendance === "Online") {
      conferenceForm.conferenceLocation = "";
    }
  },
);

watch(
  () => conferenceForm.conferenceStartDate,
  () => {
    syncConferenceYearFromStartDate(conferenceForm);
  },
);

function conferenceFieldError(condition: boolean, message: string) {
  return conferenceStepAttempted.value && condition ? message : undefined;
}

const conferenceNameError = computed(() =>
  conferenceFieldError(
    !conferenceForm.conferenceName.trim(),
    "Conference name is required",
  ),
);

const conferenceStartDateError = computed(() => {
  if (!conferenceStepAttempted.value) return undefined;
  return conferenceDateRangeFieldErrors(
    conferenceForm.conferenceStartDate,
    conferenceForm.conferenceEndDate,
  ).start;
});

const conferenceEndDateError = computed(() => {
  if (!conferenceStepAttempted.value) return undefined;
  return conferenceDateRangeFieldErrors(
    conferenceForm.conferenceStartDate,
    conferenceForm.conferenceEndDate,
  ).end;
});

const conferenceIdentifierTypeError = computed(() =>
  conferenceFieldError(
    Boolean(
      conferenceForm.conferenceIdentifier.trim() &&
      !conferenceForm.conferenceIdentifierType.trim(),
    ),
    "Identifier type is required when an identifier is provided",
  ),
);

const conferenceAttendanceError = computed(() =>
  conferenceFieldError(
    !conferenceForm.conferenceAttendance,
    "Select whether the conference is in-person or online",
  ),
);

const conferenceLocationError = computed(() =>
  conferenceFieldError(
    conferenceForm.conferenceAttendance === "In-person" &&
      !conferenceForm.conferenceLocation.trim(),
    "Conference location is required for in-person conferences",
  ),
);

function licenseFieldError(condition: boolean, message: string) {
  return licenseStepAttempted.value && condition ? message : undefined;
}

const licenseSelectError = computed(() =>
  licenseFieldError(!uniformLicense.value.trim(), "License is required"),
);

async function mergeJobSubmissionSummary(
  patch: Partial<BulkImportSubmissionSummary>,
) {
  if (!jobId.value) return;

  const job = await getBulkPosterSubmissionJob(jobId.value);
  const existing = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;

  await updateBulkPosterSubmissionJob(jobId.value, {
    submissionSummary: { ...existing, ...patch },
  });
}

/** Declared before wizard composable (step completion reads batch state). */
const batchItems = ref<BulkImportBatchItem[]>([]);
const metadataRefreshKey = ref(0);
const batchImportFinished = ref(false);
const batchHasCompletedExtractions = computed(() =>
  batchItems.value.some((item) => item.status === "completed"),
);

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
    extraction: extractionStepComplete,
    conference: conferenceStepComplete,
    license: licenseStepComplete,
    submit: canProceedFromReview,
    review: batchImportFinished,
    preview: batchHasCompletedExtractions,
    publish: batchHasCompletedExtractions,
  },
  {
    initialJobId: props.initialJobId,
    initialImportName: props.initialImportName,
    initialStep: normalizeBulkImportWizardStep(props.initialStep),
  },
);

const setupCanContinue = computed(() => importNameValid.value);

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
  () => props.initialExtractionMethod,
  (method) => {
    if (method) {
      extractionMethod.value = normalizeBulkSubmissionExtractionMethod(method);
    }
  },
);

/** Block step UI until a resumed job is fully hydrated (including extraction status). */
const wizardResumePending = computed(
  () => Boolean(props.initialJobId) && !resumeWizardHydrated.value,
);

const posterStorageListLoading = computed(
  () =>
    Boolean(props.resumeLoading) ||
    stagedPostersLoading.value ||
    (Boolean(props.initialJobId) && !resumeWizardHydrated.value),
);

function resolveResumeWizardStep(): BulkImportWizardStep {
  const fromProps = normalizeBulkImportWizardStep(props.initialStep);
  if (fromProps) return fromProps;
  return "setup";
}

function applyLicenseSummaryFromJob(job: BulkPosterSubmissionJob) {
  const summary = job.submissionSummary as BulkImportSubmissionSummary | null;

  if (summary?.uniformLicense?.trim()) {
    uniformLicense.value = summary.uniformLicense;
  } else if (Array.isArray(summary?.licenseSpreadsheetRows)) {
    const rows = summary.licenseSpreadsheetRows as { license?: string }[];
    const firstLicense = rows.find((row) => row.license?.trim())?.license;
    if (firstLicense) uniformLicense.value = firstLicense;
  }

  applyBulkImportConferenceToForm(conferenceForm, summary?.conference);
  if (summary?.automateOrcidRorLookups === true) {
    orcidRorAutomationChoice.value = "yes";
  } else if (summary?.automateOrcidRorLookups === false) {
    orcidRorAutomationChoice.value = "no";
  } else {
    orcidRorAutomationChoice.value = undefined;
  }

  if (summary?.reviewEmbargoEnabled === true) {
    reviewEmbargoChoice.value = "yes";
  } else if (summary?.reviewEmbargoEnabled === false) {
    reviewEmbargoChoice.value = "no";
  } else {
    reviewEmbargoChoice.value = undefined;
  }
}

function applyJobSnapshot(job: BulkPosterSubmissionJob) {
  jobId.value = job.id;
  importName.value = job.name;
  extractionMethod.value = normalizeBulkSubmissionExtractionMethod(
    job.extractionMethod,
  );
  applyLicenseSummaryFromJob(job);

  const step =
    normalizeBulkImportWizardStep(job.wizardStep) ?? resolveResumeWizardStep();

  if (
    step === "extraction" ||
    step === "conference" ||
    step === "license" ||
    step === "submit" ||
    step === "review" ||
    step === "preview" ||
    step === "publish"
  ) {
    extractionStepAcknowledged.value = true;
  }

  restoreWizardStep(step);
  applyBatchStateFromJob(job);
}

function shouldHydrateExtractionStatuses(
  job: BulkPosterSubmissionJob,
): boolean {
  const summary = job.submissionSummary as BulkImportSubmissionSummary | null;
  const created = summary?.createdPosters ?? [];
  if (created.length === 0) return false;
  return (
    job.status === "processing" ||
    job.status === "completed" ||
    job.status === "failed"
  );
}

function isExtractionProgressWizardStep(step: BulkImportWizardStep): boolean {
  return (
    step === "submit" ||
    step === "review" ||
    step === "preview" ||
    step === "publish"
  );
}

async function loadBatchExtractionStatusesFromItems() {
  if (!batchItems.value.some((item) => item.extractionJobId)) return;

  if (!batchExtractionStatusesLoading.value) {
    batchExtractionStatusesLoading.value = true;
  }

  try {
    await refreshBatchExtractionStatuses();
    scheduleBatchExtractionPolling();
  } finally {
    batchExtractionStatusesLoading.value = false;
  }
}

async function hydrateListsAfterResume(step: BulkImportWizardStep) {
  if (step === "upload" || step === "extraction" || step === "submit") {
    await refreshStagedPostersFromStorage();
  }
  if (step === "submit") {
    await enterSubmitStep();
  } else if (isExtractionProgressWizardStep(step)) {
    await loadBatchExtractionStatusesFromItems();
  }
}

async function ensureResumeJobLoaded() {
  const id = props.initialJobId ?? jobId.value;
  if (!id || resumeJobLoading.value) return;

  resumeJobLoading.value = true;
  stagedPosters.value = [];

  try {
    const job = await getBulkPosterSubmissionJob(id);
    const step =
      normalizeBulkImportWizardStep(job.wizardStep) ??
      resolveResumeWizardStep();

    if (
      shouldHydrateExtractionStatuses(job) &&
      isExtractionProgressWizardStep(step)
    ) {
      batchExtractionStatusesLoading.value = true;
    }

    applyJobSnapshot(job);
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
    batchExtractionStatusesLoading.value = false;
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

async function navigateToWizardStep(step: BulkImportWizardStep) {
  if (
    hasUnsubmittedStagedPosters.value &&
    (step === "review" ||
      step === "preview" ||
      step === "publish")
  ) {
    toast.add({
      title: "Extract new posters first",
      description:
        "You added poster files after the last extraction run. Open the AI metadata extraction step to process them.",
      color: "warning",
    });
    await goToStep("submit");
    return;
  }

  if (
    step === "review" &&
    batchImportFinished.value &&
    batchExtractionsInProgress.value
  ) {
    toast.add({
      title: "Extraction still in progress",
      description:
        "Wait until every poster has finished or failed before opening supplementary metadata.",
      color: "warning",
    });
    return;
  }
  await goToStep(step);
}

async function goToStep(step: BulkImportWizardStep) {
  const moved = goToWizardStep(step, {
    beforeEnter: (target) => {
      if (target === "upload") {
        void refreshStagedPostersFromStorage();
      }
    },
  });

  if (moved) {
    void persistWizardStep(step);
    if (step === "submit") {
      await enterSubmitStep();
    }
  }
}

watch(
  () => [jobId.value, currentStep.value] as const,
  ([id, step]) => {
    if (id && step === "upload") {
      void refreshStagedPostersFromStorage();
    }
    // Submit step refresh is handled by onEnterSubmitStep to avoid duplicate polls.
    if (
      step === "review" ||
      step === "preview" ||
      step === "publish"
    ) {
      void syncSubmitStepBatchProgress();
    }
    if (
      step !== "submit" &&
      step !== "review" &&
      step !== "preview" &&
      step !== "publish"
    ) {
      stopBatchExtractionPolling();
    }
  },
);

onBeforeUnmount(() => {
  stopBatchExtractionPolling();
});

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
    let license = uniformLicense.value.trim();

    if (!license && jobId.value) {
      const job = await getBulkPosterSubmissionJob(jobId.value);
      const summary = job.submissionSummary as
        | BulkImportSubmissionSummary
        | null
        | undefined;
      license = summary?.uniformLicense?.trim() ?? "";
    }

    if (license && stagedPosterFileNames.value.length > 0) {
      submissionRows.value = buildSubmissionRowsFromSeparateUpload({
        spreadsheetRows: buildSpreadsheetRowsForUniformLicense(
          stagedPosterFileNames.value,
          license,
        ),
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
      applyBatchStateFromJob(job);
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
    const response = await uploadBulkPosterSubmissionFile(jobId.value, file, {
      onUploadProgress: (percent) => {
        currentPosterFileUploadPercent.value = percent;
      },
    });
    stagedPosters.value = response.job.stagedPosters ?? stagedPosters.value;
    if (batchImportFinished.value) {
      applyBatchStateFromJob(response.job);
      await refreshSubmissionRows();
    }
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
    resetPosterUploadProgressIfIdle();
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
    applyBatchStateFromJob(job);
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
    applyBatchStateFromJob(job);
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

const batchImportRunning = ref(false);
const batchExtractionStatusesLoading = ref(false);
const BULK_BATCH_EXTRACTION_POLL_MS = 3000;
let batchExtractionPollTimer: ReturnType<typeof setTimeout> | undefined;

type BulkExtractionJobStatusResponse = {
  status: string;
  completed: boolean;
  error: string | null;
};

const batchProgress = computed(() => {
  if (batchItems.value.length === 0) return 0;
  const completed = batchItems.value.filter(
    (item) => item.status === "completed",
  ).length;
  return Math.round((completed / batchItems.value.length) * 100);
});

const batchCompletedCount = computed(
  () => batchItems.value.filter((item) => item.status === "completed").length,
);

const batchFailedCount = computed(
  () => batchItems.value.filter((item) => item.status === "failed").length,
);

const batchInProgressItems = computed(() =>
  batchItems.value.filter((item) => item.status !== "failed"),
);

const batchFailedItems = computed(() =>
  batchItems.value.filter((item) => item.status === "failed"),
);

const batchStillExtractingCount = computed(
  () =>
    batchItems.value.filter(
      (item) => item.status !== "completed" && item.status !== "failed",
    ).length,
);

const batchExtractionsInProgress = computed(
  () => batchStillExtractingCount.value > 0,
);

function batchStatusFromExtractionJob(
  job: BulkExtractionJobStatusResponse,
): BulkImportBatchItemStatus {
  if (job.status === "failed") return "failed";
  if (job.completed && job.status === "completed") return "completed";
  if (job.status === "pending-extraction") return "waitingInQueue";
  if (job.status === "pending-thumbnail") return "extracting";
  if (job.status === "processing") return "extracting";
  return "waitingInQueue";
}

const batchRetryingJobIds = ref<Set<string>>(new Set());

function isBatchExtractionRetrying(item: BulkImportBatchItem) {
  return (
    item.extractionJobId != null &&
    batchRetryingJobIds.value.has(item.extractionJobId)
  );
}

const batchRetryingAnyFailed = computed(() =>
  batchFailedItems.value.some((item) => isBatchExtractionRetrying(item)),
);

async function retryBatchExtraction(item: BulkImportBatchItem) {
  const extractionJobId = item.extractionJobId;
  if (!extractionJobId || item.status !== "failed") return;

  const retrying = new Set(batchRetryingJobIds.value);
  retrying.add(extractionJobId);
  batchRetryingJobIds.value = retrying;

  try {
    await $fetch(`/api/poster/job/${extractionJobId}/retry`, {
      method: "POST",
    });
    const row = batchItems.value.find((entry) => entry.id === item.id);
    if (row) {
      row.status = "waitingInQueue";
      row.error = undefined;
    }
    scheduleBatchExtractionPolling();
  } catch (error) {
    toast.add({
      title: "Could not retry extraction",
      description:
        fetchErrorDescription(error) ??
        "The extraction job could not be restarted.",
      color: "error",
    });
  } finally {
    const next = new Set(batchRetryingJobIds.value);
    next.delete(extractionJobId);
    batchRetryingJobIds.value = next;
  }
}

async function retryAllFailedBatchExtractions() {
  const failed = batchItems.value.filter(
    (item) => item.status === "failed" && item.extractionJobId,
  );
  await Promise.all(failed.map((item) => retryBatchExtraction(item)));
}

function stopBatchExtractionPolling() {
  if (batchExtractionPollTimer) {
    clearTimeout(batchExtractionPollTimer);
    batchExtractionPollTimer = undefined;
  }
}

function onMetadataWorkbookImported() {
  metadataRefreshKey.value += 1;
}

function batchExtractionPollPending() {
  return batchItems.value.some(
    (item) => item.status !== "completed" && item.status !== "failed",
  );
}

async function refreshBatchExtractionStatuses() {
  const withJobs = batchItems.value.filter((item) => item.extractionJobId);
  if (withJobs.length === 0) return;

  const newlyCompletedPosterIds: number[] = [];

  await Promise.all(
    withJobs.map(async (item) => {
      try {
        const response = await $fetch<BulkExtractionJobStatusResponse>(
          `/api/poster/job/${item.extractionJobId}`,
        );
        const row = batchItems.value.find((entry) => entry.id === item.id);
        if (!row) return;
        const wasTerminal =
          row.status === "completed" || row.status === "failed";
        const nextStatus = batchStatusFromExtractionJob(response);
        const nextError = response.error?.trim() ? response.error : undefined;
        if (row.status !== nextStatus) row.status = nextStatus;
        if (row.error !== nextError) row.error = nextError;
        if (
          !wasTerminal &&
          row.status === "completed" &&
          row.posterId != null
        ) {
          newlyCompletedPosterIds.push(row.posterId);
        }
      } catch {
        // Keep last known status if a single poll fails.
      }
    }),
  );

  if (newlyCompletedPosterIds.length > 0 && jobId.value) {
    for (const posterId of newlyCompletedPosterIds) {
      try {
        await applyBulkSubmissionMetadataToPosters(jobId.value, posterId);
      } catch {
        // Non-fatal; review step can retry apply for the whole batch.
      }
    }
  }
}

async function applyBatchLicenseAndConferenceToPosters() {
  if (!jobId.value || !batchImportFinished.value) return;
  try {
    await applyBulkSubmissionMetadataToPosters(jobId.value);
  } catch {
    // Summary may be incomplete if user has not finished the conference step.
  }
}

function scheduleBatchExtractionPolling() {
  stopBatchExtractionPolling();
  if (
    (currentStep.value !== "submit" &&
      currentStep.value !== "review" &&
      currentStep.value !== "preview" &&
      currentStep.value !== "publish") ||
    !batchImportFinished.value ||
    !batchExtractionPollPending()
  ) {
    return;
  }

  batchExtractionPollTimer = setTimeout(async () => {
    await refreshBatchExtractionStatuses();
    scheduleBatchExtractionPolling();
  }, BULK_BATCH_EXTRACTION_POLL_MS);
}

async function syncSubmitStepBatchProgress() {
  if (!batchImportFinished.value || batchItems.value.length === 0) return;
  await loadBatchExtractionStatusesFromItems();
}

const batchProgressColumns: ColumnDef<BulkImportBatchItem>[] = [
  { id: "batchProgressRow", header: "Poster file", enableSorting: false },
];

const batchFailedColumns: ColumnDef<BulkImportBatchItem>[] = [
  { accessorKey: "fileName", header: "Poster file" },
  { id: "batchError", header: "Error", enableSorting: false },
  { id: "batchFailedActions", header: "", enableSorting: false },
];

const submitStepIntro = computed(() => {
  if (batchImportRunning.value) {
    return "Starting metadata extraction for your posters…";
  }
  if (!batchImportFinished.value) {
    return "Continue below to run AI metadata extraction on each poster file in this batch.";
  }
  if (hasUnsubmittedStagedPosters.value) {
    return "You added new poster files. Start extraction for them below; posters already in progress continue in the list.";
  }
  if (batchExtractionsInProgress.value) {
    return "Wait until all posters have had their metadata extracted. You can leave this page and come back later if you are submitting a large batch.";
  }
  if (batchFailedCount.value > 0) {
    return "Some posters could not be extracted. Retry failed items below, or choose Save and Continue when the rest are ready. You will be asked to remove any posters that could not be extracted from the pipeline.";
  }
  return "Extraction is complete. Continue when you are ready to add supplementary metadata.";
});

function batchStatusLabel(status: BulkImportBatchItemStatus) {
  switch (status) {
    case "queued":
      return "Queued for extraction";
    case "uploading":
      return "Uploading";
    case "waitingInQueue":
      return "Waiting in job queue";
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
    case "waitingInQueue":
    case "queued":
      return "neutral";
    default:
      return "neutral";
  }
}

function batchStatusIcon(
  status: BulkImportBatchItemStatus,
): string | undefined {
  switch (status) {
    case "waitingInQueue":
      return "i-lucide-clock";
    case "uploading":
    case "extracting":
      return "i-lucide-loader-circle";
    default:
      return undefined;
  }
}

function isStagedPosterAlreadySubmitted(
  staged: BulkImportStagedPoster,
  created: BulkImportSubmissionSummary["createdPosters"],
) {
  if (!created?.length) return false;
  if (created.some((entry) => entry.filePath === staged.filePath)) return true;
  return created.some(
    (entry) => !entry.filePath && entry.fileName === staged.fileName,
  );
}

function rebuildBatchItemsFromJobAndStaged(
  summary: BulkImportSubmissionSummary | null,
) {
  const created = summary?.createdPosters ?? [];
  const previousByKey = new Map<string, BulkImportBatchItem>();
  for (const item of batchItems.value) {
    if (item.posterId != null) {
      previousByKey.set(`poster:${item.posterId}`, item);
    }
    if (item.filePath) {
      previousByKey.set(`path:${item.filePath}`, item);
    }
  }

  const items: BulkImportBatchItem[] = created.map((poster) => {
    const prev =
      previousByKey.get(`poster:${poster.posterId}`) ??
      (poster.filePath
        ? previousByKey.get(`path:${poster.filePath}`)
        : undefined);
    const sameJob =
      prev?.extractionJobId != null &&
      prev.extractionJobId === poster.extractionJobId;

    return {
      id: `bulk-poster-${poster.posterId}`,
      fileName: poster.fileName,
      filePath: poster.filePath,
      posterId: poster.posterId,
      extractionJobId: poster.extractionJobId,
      status: sameJob && prev ? prev.status : ("waitingInQueue" as const),
      error: sameJob && prev ? prev.error : undefined,
    };
  });

  for (const staged of stagedPosters.value) {
    if (isStagedPosterAlreadySubmitted(staged, created)) continue;
    items.push({
      id: `bulk-pending-${staged.filePath}`,
      fileName: staged.fileName,
      filePath: staged.filePath,
      status: "queued",
    });
  }

  batchItems.value = items;
}

const hasUnsubmittedStagedPosters = computed(() =>
  stagedPosters.value.some(
    (staged) =>
      !batchItems.value.some(
        (item) =>
          item.posterId != null &&
          (item.filePath === staged.filePath ||
            (!item.filePath && item.fileName === staged.fileName)),
      ),
  ),
);

async function enterSubmitStep() {
  await refreshStagedPostersFromStorage();
  await onEnterSubmitStep();
}

async function onEnterSubmitStep() {
  let job: BulkPosterSubmissionJob | null = null;

  if (jobId.value) {
    try {
      job = await getBulkPosterSubmissionJob(jobId.value);
    } catch {
      // Keep current batch items if refresh fails.
    }
  }

  if (job) {
    if (shouldHydrateExtractionStatuses(job)) {
      batchExtractionStatusesLoading.value = true;
    }
    applyBatchStateFromJob(job);
  }

  await refreshSubmissionRows();

  if (batchImportRunning.value) {
    batchExtractionStatusesLoading.value = false;
    return;
  }

  if (hasUnsubmittedStagedPosters.value && canProceedFromReview.value) {
    batchExtractionStatusesLoading.value = false;
    await startImport();
    return;
  }

  if (batchImportFinished.value) {
    await loadBatchExtractionStatusesFromItems();
  } else {
    batchExtractionStatusesLoading.value = false;
  }
}

function applyBatchStateFromJob(job: BulkPosterSubmissionJob) {
  const summary = job.submissionSummary as BulkImportSubmissionSummary | null;
  batchImportFinished.value =
    job.status === "processing" ||
    job.status === "completed" ||
    job.status === "failed";

  if (batchImportFinished.value || summary?.createdPosters?.length) {
    rebuildBatchItemsFromJobAndStaged(summary);
  }
}

async function continueToExtraction() {
  if (posterUploadRunning.value) return;

  if (stagedPosters.value.length === 0) {
    toast.add({
      title: "Add poster files",
      description: "Drop or select at least one poster file before continuing.",
      color: "warning",
    });
    return;
  }

  goToStep("extraction");
}

async function continueToConference() {
  if (!extractionStepReady.value) return;

  if (!jobId.value) {
    extractionStepAcknowledged.value = true;
    goToStep("conference");
    return;
  }

  extractionStepSaving.value = true;

  try {
    await updateBulkPosterSubmissionJob(jobId.value, {
      extractionMethod: extractionMethod.value,
    });
    const embargoEnabled = reviewEmbargoChoice.value === "yes";
    await mergeJobSubmissionSummary({
      automateOrcidRorLookups: orcidRorAutomationChoice.value === "yes",
      reviewEmbargoEnabled: embargoEnabled,
      reviewEmbargoDays: embargoEnabled
        ? DEFAULT_BULK_IMPORT_REVIEW_EMBARGO_DAYS
        : undefined,
    });
    extractionStepAcknowledged.value = true;
    void persistWizardStep("extraction");
    goToStep("conference");
  } catch (error) {
    toast.add({
      title: "Could not save extraction choice",
      description:
        fetchErrorDescription(error) ?? "Try again before continuing.",
      color: "error",
    });
  } finally {
    extractionStepSaving.value = false;
  }
}

async function continueToLicense() {
  conferenceStepAttempted.value = true;
  if (!conferenceStepComplete.value) return;

  const conference = bulkImportConferenceFromForm(conferenceForm);
  if (!conference || !jobId.value) {
    goToStep("license");
    return;
  }

  conferenceStepSaving.value = true;

  try {
    await mergeJobSubmissionSummary({ conference });
    void persistWizardStep("conference");
    goToStep("license");
  } catch (error) {
    toast.add({
      title: "Could not save conference information",
      description:
        fetchErrorDescription(error) ?? "Try again before continuing.",
      color: "error",
    });
  } finally {
    conferenceStepSaving.value = false;
  }
}

async function continueToSubmit() {
  licenseStepAttempted.value = true;
  if (!licenseStepComplete.value) return;

  const license = uniformLicense.value.trim();
  if (!license || !jobId.value) {
    await goToStep("submit");
    await refreshSubmissionRows();
    return;
  }

  licenseStepSaving.value = true;

  try {
    await mergeJobSubmissionSummary({
      uniformLicense: license,
      licenseSpreadsheetRows: buildSpreadsheetRowsForUniformLicense(
        stagedPosterFileNames.value,
        license,
      ),
    });
    void persistWizardStep("license");
    await goToStep("submit");
    await refreshSubmissionRows();
    await applyBatchLicenseAndConferenceToPosters();
  } catch (error) {
    toast.add({
      title: "Could not save license",
      description:
        fetchErrorDescription(error) ?? "Try again before continuing.",
      color: "error",
    });
  } finally {
    licenseStepSaving.value = false;
  }
}

const continueToReviewSaving = ref(false);

function requestContinueToReviewMetadata() {
  if (!batchImportFinished.value) return;
  if (batchExtractionsInProgress.value) return;
  if (jobId.value && batchFailedCount.value > 0) {
    discardFailedConfirmOpen.value = true;
    return;
  }
  void finishContinueToReviewMetadata();
}

async function finishContinueToReviewMetadata() {
  if (
    !batchImportFinished.value ||
    continueToReviewSaving.value ||
    batchExtractionsInProgress.value
  ) {
    return;
  }

  if (jobId.value && batchFailedCount.value > 0) {
    continueToReviewSaving.value = true;
    try {
      const result = await discardFailedBulkExtractions(jobId.value);
      stagedPosters.value = result.job.stagedPosters ?? [];
      applyBatchStateFromJob(result.job);
      discardFailedConfirmOpen.value = false;
      if (result.removedCount > 0) {
        toast.add({
          title: "Removed failed posters",
          description:
            result.removedCount === 1
              ? `${result.removedFileNames[0] ?? "One poster"} was removed from this batch.`
              : `${result.removedCount} poster(s) that failed extraction were removed from this batch.`,
          color: "neutral",
        });
      }
    } catch (error) {
      toast.add({
        title: "Could not remove failed posters",
        description:
          fetchErrorDescription(error) ??
          "Try again or retry failed extractions before continuing.",
        color: "error",
      });
      return;
    } finally {
      continueToReviewSaving.value = false;
    }
  }

  if (goToStep("review")) {
    void persistWizardStep("review");
  }
}

function continueToViewMetadata() {
  if (!batchHasCompletedExtractions.value) return;
  if (goToStep("preview")) {
    void persistWizardStep("preview");
  }
}

function continueToPublishStep() {
  if (!batchHasCompletedExtractions.value) return;
  if (goToStep("publish")) {
    void persistWizardStep("publish");
  }
}

function onSubmitStepContinue() {
  if (hasUnsubmittedStagedPosters.value) {
    void startImport();
    return;
  }
  if (batchImportFinished.value) {
    requestContinueToReviewMetadata();
    return;
  }
  void startImport();
}

async function startImport() {
  if (batchImportRunning.value) return;
  if (batchImportFinished.value && !hasUnsubmittedStagedPosters.value) return;

  if (!hasUnsubmittedStagedPosters.value && stagedPosters.value.length === 0) {
    toast.add({
      title: "Nothing to import",
      description: "Add at least one poster file before submitting.",
      color: "warning",
    });
    return;
  }

  if (!hasUnsubmittedStagedPosters.value) {
    toast.add({
      title: "Nothing new to submit",
      description: "Every staged file already has an extraction job.",
      color: "info",
    });
    return;
  }

  if (!canProceedFromReview.value) {
    toast.add({
      title: "Fix submission issues",
      description: "Resolve license or file issues before submitting.",
      color: "warning",
    });
    return;
  }

  if (batchItems.value.length === 0 && stagedPosters.value.length === 0) {
    toast.add({
      title: "Nothing to import",
      description: "Fix submission issues before submitting.",
      color: "warning",
    });
    return;
  }

  if (!jobId.value) {
    toast.add({
      title: "Save your batch first",
      description:
        "Complete the name step so this import is saved before submitting.",
      color: "warning",
    });
    return;
  }

  batchImportRunning.value = true;

  try {
    await syncBulkStagedPostersFromStorage(jobId.value);
    const jobAfterSync = await getBulkPosterSubmissionJob(jobId.value);
    stagedPosters.value = jobAfterSync.stagedPosters ?? [];
    rebuildBatchItemsFromJobAndStaged(
      jobAfterSync.submissionSummary as BulkImportSubmissionSummary | null,
    );

    if (!hasUnsubmittedStagedPosters.value) {
      toast.add({
        title: "Nothing new to submit",
        description: "Every staged file already has an extraction job.",
        color: "info",
      });
      return;
    }

    const result = await submitBulkPosterSubmissionJob(jobId.value);
    batchImportFinished.value = true;
    batchExtractionStatusesLoading.value = true;
    rebuildBatchItemsFromJobAndStaged(
      result.job.submissionSummary as BulkImportSubmissionSummary | null,
    );
    await loadBatchExtractionStatusesFromItems();
    const addedCount = result.posters.length;
    toast.add({
      title: addedCount > 0 ? "Posters submitted" : "Nothing new to submit",
      description:
        addedCount > 0
          ? `Created extraction jobs for ${addedCount} poster(s).`
          : "Every staged file already has an extraction job.",
      color: addedCount > 0 ? "success" : "info",
    });
  } catch (error) {
    batchItems.value = [];
    toast.add({
      title: "Could not submit batch",
      description:
        fetchErrorDescription(error) ??
        "Try again. If the problem persists, contact support.",
      color: "error",
    });
  } finally {
    batchImportRunning.value = false;
  }
}
</script>

<template>
  <UCard class="flex flex-col" :ui="{ header: 'overflow-visible' }">
    <template #header>
      <div class="flex flex-col gap-4 overflow-visible">
        <div class="flex items-center justify-between gap-3">
          <h2 class="min-w-0 truncate text-lg font-semibold">
            {{ headerTitle }}
          </h2>

          <UButton
            to="/dashboard"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-arrow-left"
            label="Exit to dashboard"
            class="shrink-0"
          />
        </div>

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
                @click="navigateToWizardStep(step.id)"
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
                </div>
              </button>
            </li>
          </ol>
        </nav>
      </div>
    </template>

    <div class="flex flex-col gap-8">
      <div
        v-if="wizardResumePending"
        class="flex items-center justify-center py-16"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="text-primary size-10 animate-spin"
        />
      </div>

      <template v-else-if="currentStep === 'setup'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Batch name
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
            </p>
          </div>

          <UFormField
            label="Batch name"
            required
            :hint="`${BULK_IMPORT_NAME_MIN_LENGTH}–${BULK_IMPORT_NAME_MAX_LENGTH} characters`"
          >
            <UInput
              v-model="importName"
              placeholder="e.g. Posters from the 2026 International Research Conference"
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
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Back"
            to="/dashboard"
          />
          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Save and Continue"
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
              title="Upload all posters for this batch"
              description="Drag and drop every poster file here, or click to browse."
              :accept="POSTER_FILE_ACCEPT"
              :validate-file="validatePosterUploadFile"
              :hint="`${POSTER_ONLY_HINT}. Files upload as soon as you add them.`"
              @on-change="onPosterFilesSelected"
              @on-reject="onPosterFilesRejected"
            >
              <UiFileUploadGrid />
            </UiFileUpload>

            <div
              v-if="posterUploadProgressVisible"
              class="space-y-1.5"
              aria-live="polite"
              aria-busy="true"
            >
              <div class="flex items-center justify-between gap-2 text-sm">
                <span class="text-muted">Uploading posters</span>
                <span class="font-medium tabular-nums">
                  {{ posterUploadProgressLabel }}
                  ·
                  {{ posterUploadOverallPercent }}%
                </span>
              </div>
              <UProgress :model-value="posterUploadOverallPercent" size="sm" />
            </div>

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
                        v-if="row.status !== 'stored'"
                        :color="row.status === 'uploading' ? 'info' : 'error'"
                        variant="soft"
                        size="xs"
                      >
                        {{
                          row.status === "uploading"
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
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Back"
            @click="goToStep('setup')"
          />
          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Save and Continue"
            :disabled="
              !canContinueFromUpload || !jobId || posterStorageListLoading
            "
            :loading="posterUploadRunning"
            @click="continueToExtraction"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'extraction'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Poster details
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
            </p>
          </div>

          <UFormField
            label="How much metadata should we auto-fill?"
            required
            description="Every poster file is still processed by AI. This choice controls how much of the extraction we copy into your batch."
          >
            <div class="space-y-3">
              <label
                v-for="option in BULK_EXTRACTION_LEVEL_OPTIONS"
                :key="option.value"
                class="flex gap-3 rounded-lg border p-4 transition-colors"
                :class="[
                  option.disabled
                    ? 'cursor-not-allowed opacity-70'
                    : 'cursor-pointer',
                  isExtractionLevelSelected(option.value)
                    ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
                    : 'border-gray-200 dark:border-gray-800',
                ]"
              >
                <UCheckbox
                  class="mt-0.5 shrink-0"
                  :model-value="isExtractionLevelSelected(option.value)"
                  :disabled="option.disabled"
                  @update:model-value="
                    (checked) =>
                      onExtractionLevelCheckbox(option.value, checked)
                  "
                />

                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm font-semibold">{{
                      option.label
                    }}</span>
                    <UBadge
                      v-if="option.badge"
                      color="neutral"
                      variant="soft"
                      size="xs"
                    >
                      {{ option.badge }}
                    </UBadge>
                    <span class="text-muted text-xs">
                      {{ option.accuracyNote }}
                    </span>
                  </div>
                  <p class="text-muted text-sm">{{ option.description }}</p>
                </div>
              </label>
            </div>
          </UFormField>

          <UFormField
            label="Automate ORCID and ROR lookups"
            required
            description="Choose whether we should look up ORCID and ROR identifiers for creators and affiliations in this batch."
          >
            <URadioGroup
              v-model="orcidRorAutomationChoice"
              :items="orcidRorAutomationItems"
              value-key="value"
              label-key="label"
              :ui="{ fieldset: 'gap-3', item: 'items-start' }"
            />
          </UFormField>

          <UFormField
            label="30-day embargo before Zenodo submission"
            required
            description="Choose whether posters stay on Posters.science for a 30-day review period with an editable spreadsheet before Zenodo publish."
          >
            <URadioGroup
              v-model="reviewEmbargoChoice"
              :items="reviewEmbargoItems"
              value-key="value"
              label-key="label"
              :ui="{ fieldset: 'gap-3', item: 'items-start' }"
            />
          </UFormField>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Back"
            @click="goToStep('upload')"
          />
          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Save and Continue"
            :disabled="!extractionStepReady"
            :loading="extractionStepSaving"
            @click="continueToConference"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'conference'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Conference information
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
            </p>
          </div>

          <p class="text-muted text-sm">
            Conference name, format, and start date are required. The conference
            year is set from the start date. Other fields match the poster metadata
            schema and are optional.
          </p>

          <div class="space-y-4">
            <UFormField
              label="Conference name"
              required
              :error="conferenceNameError"
            >
              <UInput
                v-model="conferenceForm.conferenceName"
                placeholder="e.g. Annual Research Conference"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Conference acronym" name="conferenceAcronym">
              <UInput
                v-model="conferenceForm.conferenceAcronym"
                placeholder="e.g. EARC"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Conference format"
              required
              :error="conferenceAttendanceError"
            >
              <USelect
                v-model="conferenceForm.conferenceAttendance"
                class="w-full"
                :items="BULK_IMPORT_CONFERENCE_ATTENDANCE_OPTIONS"
                placeholder="In-person or online"
              />
            </UFormField>

            <UFormField
              v-if="conferenceForm.conferenceAttendance === 'In-person'"
              label="Conference location"
              required
              :error="conferenceLocationError"
            >
              <UInput
                v-model="conferenceForm.conferenceLocation"
                placeholder="e.g. Seattle, WA, USA"
                class="w-full"
              />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="Conference start date"
                required
                :error="conferenceStartDateError"
              >
                <UInput
                  v-model="conferenceForm.conferenceStartDate"
                  type="date"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Conference end date" :error="conferenceEndDateError">
                <UInput
                  v-model="conferenceForm.conferenceEndDate"
                  type="date"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField label="Conference website">
              <UInput
                v-model="conferenceForm.conferenceUri"
                type="url"
                placeholder="https://"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Conference identifier">
              <UInput
                v-model="conferenceForm.conferenceIdentifier"
                placeholder="Optional external identifier"
                class="w-full"
              />
            </UFormField>

            <template v-if="showConferenceIdentifierDetails">
              <UFormField
                label="Conference identifier type"
                required
                :error="conferenceIdentifierTypeError"
              >
                <USelectMenu
                  v-model="conferenceForm.conferenceIdentifierType"
                  :items="conferenceIdentifierTypeOptions"
                  value-key="value"
                  searchable
                  placeholder="Select identifier type"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Conference schema URI">
                <UInput
                  v-model="conferenceForm.conferenceSchemaUri"
                  type="url"
                  placeholder="https://"
                  class="w-full"
                />
              </UFormField>
            </template>

            <UFormField label="Conference series">
              <UInput
                v-model="conferenceForm.conferenceSeries"
                placeholder="Optional series name"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Back"
            @click="goToStep('extraction')"
          />
          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Save and Continue"
            :disabled="!conferenceStepComplete"
            :loading="conferenceStepSaving"
            @click="continueToLicense"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'license'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: License information
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
            </p>
          </div>

          <UFormField
            label="License for all posters"
            required
            :error="licenseSelectError"
          >
            <USelectMenu
              v-model="uniformLicense"
              :items="uniformLicenseSelectItems"
              value-key="value"
              searchable
              :search-input="{
                placeholder: 'Search licenses…',
                icon: 'i-lucide-search',
              }"
              placeholder="Choose a license…"
              class="w-full"
              :virtualize="true"
            />
          </UFormField>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Back"
            @click="goToStep('conference')"
          />
          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Save and Continue"
            :disabled="!licenseStepComplete"
            :loading="licenseStepSaving"
            @click="continueToSubmit"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'submit'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: AI metadata extraction
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ submitStepIntro }}
            </p>
          </div>

          <div
            v-if="batchExtractionStatusesLoading"
            class="flex items-center justify-center py-12"
            aria-live="polite"
            aria-busy="true"
            aria-label="Loading"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="text-primary size-10 animate-spin"
            />
          </div>

          <template
            v-else-if="
              batchImportFinished &&
              batchItems.some((item) => item.extractionJobId)
            "
          >
            <div v-if="batchItems.length > 0" class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted">Overall progress</span>
                <span class="font-medium">{{ batchProgress }}%</span>
              </div>
              <UProgress :model-value="batchProgress" size="sm" />
            </div>

            <div
              v-if="
                batchInProgressItems.length > 0 || batchFailedItems.length > 0
              "
              class="flex flex-col gap-4 lg:flex-row lg:items-start"
            >
              <div
                v-if="batchInProgressItems.length > 0"
                class="flex min-w-0 flex-1 flex-col gap-2"
              >
                <h4 class="text-sm font-semibold">Extraction progress</h4>
                <div
                  class="border-default max-h-[1000px] overflow-auto rounded-lg border"
                >
                  <UTable
                    :data="batchInProgressItems"
                    :columns="batchProgressColumns"
                  >
                    <template #batchProgressRow-header>
                      <div
                        class="flex w-full items-center justify-between gap-4 pe-1"
                      >
                        <span>Poster file</span>
                        <span class="text-muted font-medium">Progress</span>
                      </div>
                    </template>

                    <template #batchProgressRow-cell="{ row }">
                      <div
                        class="flex w-full items-center justify-between gap-4"
                      >
                        <span
                          class="line-clamp-2 min-w-0 flex-1 text-left text-sm font-medium"
                          :title="row.original.fileName"
                        >
                          {{ row.original.fileName }}
                        </span>
                        <UBadge
                          class="shrink-0"
                          :color="batchStatusColor(row.original.status)"
                          variant="solid"
                          size="xs"
                          :icon="batchStatusIcon(row.original.status)"
                        >
                          {{ batchStatusLabel(row.original.status) }}
                        </UBadge>
                      </div>
                    </template>
                  </UTable>
                </div>
              </div>

              <div
                v-if="batchFailedItems.length > 0"
                class="flex min-w-0 flex-1 flex-col gap-2"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h4 class="text-sm font-semibold">
                    Failed extractions ({{ batchFailedItems.length }})
                  </h4>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-rotate-ccw"
                    label="Retry all failed"
                    :disabled="
                      !batchFailedItems.some((item) => item.extractionJobId)
                    "
                    :loading="batchRetryingAnyFailed"
                    @click="retryAllFailedBatchExtractions"
                  />
                </div>

                <div
                  class="border-default max-h-[1000px] overflow-auto rounded-lg border"
                >
                  <UTable
                    :data="batchFailedItems"
                    :columns="batchFailedColumns"
                  >
                    <template #fileName-cell="{ row }">
                      <span
                        class="line-clamp-2 max-w-md text-sm font-medium"
                        :title="row.original.fileName"
                      >
                        {{ row.original.fileName }}
                      </span>
                    </template>

                    <template #batchError-cell="{ row }">
                      <p
                        class="text-muted text-xs whitespace-pre-wrap"
                        :title="row.original.error ?? undefined"
                      >
                        {{
                          row.original.error?.trim() ||
                          "Extraction failed with no error message."
                        }}
                      </p>
                    </template>

                    <template #batchFailedActions-cell="{ row }">
                      <UButton
                        v-if="row.original.extractionJobId"
                        size="xs"
                        color="neutral"
                        variant="outline"
                        icon="i-lucide-rotate-ccw"
                        label="Retry"
                        :loading="isBatchExtractionRetrying(row.original)"
                        @click="retryBatchExtraction(row.original)"
                      />
                    </template>
                  </UTable>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Back"
            :disabled="batchImportRunning"
            @click="goToStep('license')"
          />

          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Save and Continue"
            :disabled="
              batchImportRunning ||
              continueToReviewSaving ||
              (batchImportFinished &&
                !hasUnsubmittedStagedPosters &&
                batchExtractionsInProgress) ||
              (!batchImportFinished &&
                (!canProceedFromReview || submissionLoading))
            "
            :loading="batchImportRunning || continueToReviewSaving"
            @click="onSubmitStepContinue"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'review'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Supplementary metadata
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
            </p>
          </div>

          <div class="space-y-4" aria-labelledby="bulk-workbook-heading">
            <h4 id="bulk-workbook-heading" class="text-base font-semibold">
              Batch metadata workbook
            </h4>
            <BulkImportSpreadsheetStep
              :bulk-job-id="jobId"
              :completed-poster-count="batchCompletedCount"
              :extraction-method="extractionMethod"
              @imported="onMetadataWorkbookImported"
            />
          </div>

          <div
            class="border-default space-y-4 border-t pt-8"
            aria-labelledby="bulk-poster-previews-heading"
          >
            <div>
              <h4 id="bulk-poster-previews-heading" class="text-base font-semibold">
                Poster previews
              </h4>
              <p class="text-muted mt-1 text-sm">
                Use the interface below to preview each poster in this batch while
                you work in the workbook.
              </p>
            </div>

            <BulkImportMetadataReview
              :items="batchItems"
              :bulk-import-job-id="jobId"
              :extraction-method="extractionMethod"
              :metadata-refresh-key="metadataRefreshKey"
              :retrying-job-ids="batchRetryingJobIds"
              @retry="retryBatchExtraction"
            />
          </div>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Back"
            @click="goToStep('submit')"
          />

          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Save and Continue"
            :disabled="!batchHasCompletedExtractions"
            @click="continueToViewMetadata"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'preview'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: View metadata
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
            </p>
          </div>

          <BulkImportPosterJsonPreview :items="batchItems" />
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Back"
            @click="goToStep('review')"
          />

          <UButton
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            label="Save and Continue"
            :disabled="!batchHasCompletedExtractions"
            @click="continueToPublishStep"
          />
        </div>
      </template>

      <template v-else-if="currentStep === 'publish'">
        <div class="space-y-4">
          <div>
            <h3 class="text-base font-semibold">
              Step {{ currentStepNumber }}: Submit
            </h3>
            <p class="text-muted mt-1 text-sm">
              {{ currentStepTask }}
            </p>
          </div>

          <BulkImportPublishStep
            :items="batchItems"
            :bulk-job-id="jobId"
            :uniform-license="uniformLicense"
          />
        </div>

        <div
          class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-6 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-arrow-left"
            label="Back"
            @click="goToStep('preview')"
          />
        </div>
      </template>
    </div>
  </UCard>

  <UModal
    v-model:open="discardFailedConfirmOpen"
    title="Remove failed posters?"
    class="max-w-md"
  >
    <template #body>
      <p class="text-sm">
        <template v-if="batchFailedCount === 1">
          One poster could not be extracted. Continuing will permanently remove
          it from this batch, including its stored file and draft record.
        </template>
        <template v-else>
          {{ batchFailedCount }} posters could not be extracted. Continuing will
          permanently remove them from this batch, including their stored files
          and draft records.
        </template>
      </p>

      <ul
        class="border-default divide-default mt-4 max-h-48 divide-y overflow-y-auto rounded-md border text-sm"
      >
        <li v-for="item in batchFailedItems" :key="item.id" class="px-3 py-2">
          <span class="font-medium">{{ item.fileName }}</span>
          <p
            v-if="item.error"
            class="text-muted mt-0.5 text-xs"
            :title="item.error"
          >
            {{ item.error }}
          </p>
        </li>
      </ul>

      <p class="text-muted mt-3 text-sm">
        To try again instead, cancel and click the Retry all failed button.
      </p>
    </template>

    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        label="Cancel"
        :disabled="continueToReviewSaving"
        @click="discardFailedConfirmOpen = false"
      />
      <UButton
        color="warning"
        label="Remove and continue"
        :loading="continueToReviewSaving"
        @click="finishContinueToReviewMetadata"
      />
    </template>
  </UModal>

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
