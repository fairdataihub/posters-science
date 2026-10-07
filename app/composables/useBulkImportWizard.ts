import {
  BULK_IMPORT_NAME_MAX_LENGTH,
  BULK_IMPORT_NAME_MIN_LENGTH,
  BULK_IMPORT_WIZARD_STEPS,
  type BulkImportWizardStep,
} from "#shared/types/bulkImportWizard";

export type BulkImportWizardStepCompletion = {
  upload: MaybeRefOrGetter<boolean>;
  metadata: MaybeRefOrGetter<boolean>;
  review: MaybeRefOrGetter<boolean>;
};

function stepIndex(step: BulkImportWizardStep) {
  return BULK_IMPORT_WIZARD_STEPS.findIndex((item) => item.id === step);
}

function readCompletion(
  source: MaybeRefOrGetter<boolean>,
): boolean {
  return toValue(source);
}

export function useBulkImportWizard(
  completion: BulkImportWizardStepCompletion,
  options?: {
    initialStep?: BulkImportWizardStep;
    initialImportName?: string;
    initialJobId?: string | null;
  },
) {
  const currentStep = ref<BulkImportWizardStep>(
    options?.initialStep ?? "setup",
  );
  const importName = ref(options?.initialImportName ?? "");
  const jobId = ref<string | null>(options?.initialJobId ?? null);

  const importNameTrimmed = computed(() => importName.value.trim());

  const importNameValid = computed(
    () =>
      importNameTrimmed.value.length >= BULK_IMPORT_NAME_MIN_LENGTH &&
      importNameTrimmed.value.length <= BULK_IMPORT_NAME_MAX_LENGTH,
  );

  /** Setup is saved once the user continues past the name step. */
  const setupSaved = computed(
    () => jobId.value !== null && importNameValid.value,
  );

  const wizardSteps = BULK_IMPORT_WIZARD_STEPS;

  const currentStepNumber = computed(() => stepIndex(currentStep.value) + 1);

  function isStepComplete(step: BulkImportWizardStep): boolean {
    switch (step) {
      case "setup":
        return setupSaved.value;
      case "upload":
        return readCompletion(completion.upload);
      case "metadata":
        return readCompletion(completion.metadata);
      case "review":
        return readCompletion(completion.review);
      case "submit":
        return false;
    }
  }

  function highestCompletedStepIndex() {
    let max = -1;
    for (let i = 0; i < wizardSteps.length; i++) {
      const step = wizardSteps[i]!.id;
      if (isStepComplete(step)) {
        max = i;
      }
    }
    return max;
  }

  /** Forward navigation is gated by step completion; backward is always allowed. */
  function canGoToStep(step: BulkImportWizardStep) {
    const targetIndex = stepIndex(step);
    if (targetIndex < 0) return false;

    const currentIndex = stepIndex(currentStep.value);
    if (targetIndex <= currentIndex) return true;

    return targetIndex <= highestCompletedStepIndex() + 1;
  }

  function stepIsDone(step: BulkImportWizardStep) {
    const idx = stepIndex(step);
    const currentIdx = stepIndex(currentStep.value);
    if (idx < currentIdx) return true;
    return isStepComplete(step) && currentIdx > idx;
  }

  function stepIsActive(step: BulkImportWizardStep) {
    return step === currentStep.value;
  }

  function goToStep(
    step: BulkImportWizardStep,
    hooks?: { beforeEnter?: (step: BulkImportWizardStep) => void },
  ) {
    if (!canGoToStep(step)) return false;

    hooks?.beforeEnter?.(step);
    currentStep.value = step;
    return true;
  }

  /** Call after the job row exists server-side (mock or DB). */
  function continueAfterSetupPersisted() {
    if (!importNameValid.value || !jobId.value) return false;
    return goToStep("upload");
  }

  const headerTitle = computed(() =>
    setupSaved.value
      ? `Bulk import — ${importNameTrimmed.value}`
      : "Bulk import",
  );

  return {
    wizardSteps,
    currentStep,
    currentStepNumber,
    importName,
    importNameTrimmed,
    importNameValid,
    jobId,
    setupSaved,
    headerTitle,
    canGoToStep,
    stepIsDone,
    stepIsActive,
    goToStep,
    continueAfterSetupPersisted,
    BULK_IMPORT_NAME_MAX_LENGTH,
    BULK_IMPORT_NAME_MIN_LENGTH,
  };
}
