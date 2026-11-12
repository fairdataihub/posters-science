import * as z from "zod";

/** Ordered steps for the bulk poster import wizard (extend this list as the flow grows). */
export type BulkImportWizardStep =
  | "upload"
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
    id: "upload",
    label: "Posters",
    task: "Name your batch, then drag and drop or import all of your posters. The name appears in your dashboard so you can return to the batch later.",
  },
  {
    id: "conference",
    label: "Conference Information",
    task: "Enter conference information that will be shared across every poster in this batch.",
  },
  {
    id: "license",
    label: "License Information",
    task: "Choose the license you would like to apply to all posters in the batch. You must have the rights or permission from each author to share every poster under the license you select.",
  },
  {
    id: "submit",
    label: "AI Poster Extraction",
    task: "Wait until all posters have had their metadata extracted. You can leave this page and come back later for large batches.",
  },
  {
    id: "review",
    label: "Review Posters",
    task: "Optionally review and add metadata for every poster in the batch below. You can skip this and edit posters individually on the next step.",
  },
  {
    id: "preview",
    label: "Poster Previews",
    task: "Preview each poster, use Edit poster for any required fixes, then continue when you are ready to publish.",
  },
  {
    id: "publish",
    label: "Submit",
    task: "Choose Zenodo, Figshare, or local download, then submit each completed poster in this batch.",
  },
];

export const BULK_IMPORT_NAME_MIN_LENGTH = 2;
export const BULK_IMPORT_NAME_MAX_LENGTH = 120;

/**
 * Saved as the name when posters are added before the batch is named (the
 * database needs one). The name field shows it as empty, so it still has to
 * be filled in before continuing.
 */
export const BULK_IMPORT_UNTITLED_NAME = "Untitled batch";

/** The batch name to show in the name field ("" while it is still untitled). */
export function bulkImportEditableName(name: string | null | undefined): string {
  return !name || name === BULK_IMPORT_UNTITLED_NAME ? "" : name;
}

/** Batch name rules for the upload step. */
export const bulkImportNameSchema = z
  .string()
  .trim()
  .min(1, { message: "Batch name is required" })
  .min(BULK_IMPORT_NAME_MIN_LENGTH, {
    message: `Batch name must be ${BULK_IMPORT_NAME_MIN_LENGTH}–${BULK_IMPORT_NAME_MAX_LENGTH} characters`,
  })
  .max(BULK_IMPORT_NAME_MAX_LENGTH, {
    message: `Batch name must be ${BULK_IMPORT_NAME_MAX_LENGTH} characters or fewer`,
  });

const BULK_IMPORT_WIZARD_STEP_SET = new Set<string>(
  BULK_IMPORT_WIZARD_STEPS.map((step) => step.id),
);

export function normalizeBulkImportWizardStep(
  step: string | undefined | null,
): BulkImportWizardStep | undefined {
  if (!step) return undefined;
  // Unknown steps return undefined, so callers fall back to the first step.
  if (BULK_IMPORT_WIZARD_STEP_SET.has(step)) {
    return step as BulkImportWizardStep;
  }
  return undefined;
}
