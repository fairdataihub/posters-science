/** Ordered steps for the bulk poster import wizard (extend this list as the flow grows). */
export type BulkImportWizardStep =
  | "setup"
  | "upload"
  | "extraction"
  | "conference"
  | "license"
  | "submit"
  | "review"
  | "preview"
  | "publish";

export type BulkImportWizardStepDefinition = {
  id: BulkImportWizardStep;
  label: string;
  /** One-line hint for what the user does on this step. */
  task: string;
};

export const BULK_IMPORT_WIZARD_STEPS: BulkImportWizardStepDefinition[] = [
  {
    id: "setup",
    label: "Batch name",
    task: "Choose a name for your batch of posters. This name will apear in your dashboard so you can easily return to it later.",
  },
  {
    id: "upload",
    label: "Posters",
    task: "Use the interface below to drag and drop or import all of your posters.",
  },
  {
    id: "extraction",
    label: "Poster details",
    task: "Choose how much metadata we auto-fill from each poster PDF, whether to run ORCID/ROR lookups, and whether to use an on-site review period (1–30 days) before Zenodo.",
  },
  {
    id: "conference",
    label: "Conference information",
    task: "Enter conference information that will be shared across every poster in this batch.",
  },
  {
    id: "license",
    label: "License information",
    task: "Choose the license you would like to apply to all posters in the batch. You must have the rights or permission from each author to share every poster under the license you select.",
  },
  {
    id: "submit",
    label: "AI metadata extraction",
    task: "Wait until all posters have had their metadata extracted. You can leave this page and come back later for large batches.",
  },
  {
    id: "review",
    label: "Supplementary metadata",
    task: "Optionally download the batch workbook to add or correct metadata in Excel, then import it here. You can skip this and edit posters directly on the next step.",
  },
  {
    id: "preview",
    label: "Poster previews",
    task: "Preview each poster in this batch and open Edit metadata to fix fields in the poster editor before you publish.",
  },
  {
    id: "publish",
    label: "Submit",
    task: "Choose Zenodo, Figshare, or local download, then submit each completed poster in this batch.",
  },
];

export const BULK_IMPORT_NAME_MIN_LENGTH = 2;
export const BULK_IMPORT_NAME_MAX_LENGTH = 120;

const BULK_IMPORT_WIZARD_STEP_SET = new Set<string>(
  BULK_IMPORT_WIZARD_STEPS.map((step) => step.id),
);

export function normalizeBulkImportWizardStep(
  step: string | undefined | null,
): BulkImportWizardStep | undefined {
  if (!step) return undefined;
  if (BULK_IMPORT_WIZARD_STEP_SET.has(step)) {
    return step as BulkImportWizardStep;
  }
  return undefined;
}
