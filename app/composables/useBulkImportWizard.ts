import {
  BULK_IMPORT_NAME_MAX_LENGTH,
  BULK_IMPORT_NAME_MIN_LENGTH,
  BULK_IMPORT_WIZARD_STEPS,
  type BulkImportWizardStep,
} from "#shared/types/bulkImportWizard";

/** Why a step cannot open right now, shown to the user as a toast. */
export type BulkImportStepBlock = {
  title: string;
  description: string;
  /** Open this step instead (e.g. a step that must be finished first). */
  openInstead?: BulkImportWizardStep;
};

/**
 * Everything one wizard step needs for navigation. Steps never name their
 * neighbours: Continue and Back follow the order of BULK_IMPORT_WIZARD_STEPS,
 * so reordering that list reorders the wizard.
 */
export type BulkImportStepHandlers = {
  /** Done enough that the following step can open. */
  isComplete: () => boolean;
  /** Return a block to stop this step from opening. */
  guard?: () => BulkImportStepBlock | null;
  /** Runs each time the step opens, including when a job is resumed on it. */
  open?: () => void | Promise<void>;
  /** Validates and saves when leaving forward. Return false to stay. */
  save?: () => boolean | Promise<boolean>;
};

function stepIndex(step: BulkImportWizardStep) {
  return BULK_IMPORT_WIZARD_STEPS.findIndex((item) => item.id === step);
}

export function useBulkImportWizard(options: {
  initialStep?: BulkImportWizardStep;
  initialImportName?: string;
  initialJobId?: string | null;
  /** Called after a step opens (not on resume), e.g. to save it on the job. */
  onStepOpened?: (step: BulkImportWizardStep) => void;
  /** Called when a guard stops a step from opening. */
  onStepBlocked?: (block: BulkImportStepBlock) => void;
}) {
  const currentStep = ref<BulkImportWizardStep>(
    options.initialStep ?? "upload",
  );
  const importName = ref(options.initialImportName ?? "");
  const jobId = ref<string | null>(options.initialJobId ?? null);

  const importNameTrimmed = computed(() => importName.value.trim());

  const importNameValid = computed(
    () =>
      importNameTrimmed.value.length >= BULK_IMPORT_NAME_MIN_LENGTH &&
      importNameTrimmed.value.length <= BULK_IMPORT_NAME_MAX_LENGTH,
  );

  /** The job is saved once the batch is named and its first poster uploads. */
  const setupSaved = computed(
    () => jobId.value !== null && importNameValid.value,
  );

  const wizardSteps = BULK_IMPORT_WIZARD_STEPS;

  const currentStepNumber = computed(() => stepIndex(currentStep.value) + 1);

  const handlers = shallowRef<
    Partial<Record<BulkImportWizardStep, BulkImportStepHandlers>>
  >({});

  /** Register every step's handlers (call once, during setup). */
  function defineStepHandlers(
    stepHandlers: Record<BulkImportWizardStep, BulkImportStepHandlers>,
  ) {
    handlers.value = stepHandlers;
  }

  function isStepComplete(step: BulkImportWizardStep): boolean {
    return handlers.value[step]?.isComplete() ?? false;
  }

  function highestCompletedStepIndex() {
    let max = -1;
    for (let i = 0; i < wizardSteps.length; i++) {
      if (isStepComplete(wizardSteps[i]!.id)) max = i;
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

  /** True while a step is saving or opening; blocks a second navigation. */
  const stepTransitionPending = ref(false);

  /**
   * The one way to change step. Moving forward saves the current step first;
   * then the target's guard and completion gates run, and its open handler.
   */
  async function openStep(target: BulkImportWizardStep): Promise<boolean> {
    if (stepTransitionPending.value || target === currentStep.value) {
      return false;
    }

    stepTransitionPending.value = true;
    let opened: BulkImportWizardStep | null = null;
    try {
      const from = currentStep.value;
      const forward = stepIndex(target) > stepIndex(from);
      if (forward) {
        const saved = (await handlers.value[from]?.save?.()) ?? true;
        if (!saved) return false;
      }

      const block = handlers.value[target]?.guard?.();
      if (block) {
        options.onStepBlocked?.(block);
        if (!block.openInstead || block.openInstead === from) return false;
        target = block.openInstead;
      }

      if (!canGoToStep(target)) return false;

      currentStep.value = target;
      opened = target;
    } finally {
      stepTransitionPending.value = false;
    }

    options.onStepOpened?.(opened);
    await handlers.value[opened]?.open?.();

    return true;
  }

  /** Save the current step and open the one after it. */
  function continueStep() {
    const next = wizardSteps[stepIndex(currentStep.value) + 1];

    return next ? openStep(next.id) : Promise.resolve(false);
  }

  /** Open the step before the current one (no save). */
  function backStep() {
    const previous = wizardSteps[stepIndex(currentStep.value) - 1];

    return previous ? openStep(previous.id) : Promise.resolve(false);
  }

  /** Resume a job on its saved step: skips save, guards and gates. */
  async function resumeStep(step: BulkImportWizardStep) {
    currentStep.value = step;
    await handlers.value[step]?.open?.();
  }

  const headerTitle = computed(() =>
    setupSaved.value ? importNameTrimmed.value : "Bulk import",
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
    defineStepHandlers,
    stepTransitionPending,
    openStep,
    continueStep,
    backStep,
    resumeStep,
    BULK_IMPORT_NAME_MAX_LENGTH,
    BULK_IMPORT_NAME_MIN_LENGTH,
  };
}
