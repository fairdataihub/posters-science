/** Ordered steps for the bulk poster import wizard (extend this list as the flow grows). */
export type BulkImportWizardStep =
  | "setup"
  | "upload"
  | "metadata"
  | "review"
  | "submit";

/** @deprecated Jobs saved on the old flow; map to `upload` when resuming. */
export type LegacyBulkImportWizardStep = "assets";

export type BulkImportWizardStepDefinition = {
  id: BulkImportWizardStep;
  label: string;
  description: string;
  /** One-line hint for what the user does on this step. */
  task: string;
};

export const BULK_IMPORT_WIZARD_STEPS: BulkImportWizardStepDefinition[] = [
  {
    id: "setup",
    label: "Name",
    description: "Batch name + how we read poster info",
    task: "Give your bulk posters upload a name that you will recognize on your dashboard. Then, select the level of extraction you want to use.",
  },
  {
    id: "upload",
    label: "Posters",
    description: "Your PDF or image files",
    task: "Add every poster file, then continue.",
  },
  {
    id: "metadata",
    label: "Licenses",
    description: "One CSV for the whole batch",
    task: "Download the template, add a license for each file, upload the CSV.",
  },
  {
    id: "review",
    label: "Check",
    description: "Files match the CSV",
    task: "Fix any rows that are not ready, then continue.",
  },
  {
    id: "submit",
    label: "Finish",
    description: "Create poster drafts",
    task: "Start import—we’ll read each poster and add drafts to your dashboard.",
  },
];

export const BULK_IMPORT_NAME_MIN_LENGTH = 2;
export const BULK_IMPORT_NAME_MAX_LENGTH = 120;

export function normalizeBulkImportWizardStep(
  step: string | undefined | null,
): BulkImportWizardStep | undefined {
  if (!step) return undefined;
  if (step === "assets") return "upload";
  if (
    step === "setup" ||
    step === "upload" ||
    step === "metadata" ||
    step === "review" ||
    step === "submit"
  ) {
    return step;
  }
  return undefined;
}
