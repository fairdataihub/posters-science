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
};

export const BULK_IMPORT_WIZARD_STEPS: BulkImportWizardStepDefinition[] = [
  {
    id: "setup",
    label: "Name import",
    description: "Label this batch for your dashboard",
  },
  {
    id: "upload",
    label: "Upload posters",
    description: "Store poster files on Posters.science",
  },
  {
    id: "metadata",
    label: "Licenses & metadata",
    description: "Spreadsheets for licenses and extraction",
  },
  {
    id: "review",
    label: "Review",
    description: "Check file names and licenses",
  },
  {
    id: "submit",
    label: "Extract",
    description: "Run the extraction pipeline",
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
