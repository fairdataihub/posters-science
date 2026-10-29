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

/** @deprecated Jobs saved on the old flow; map to `upload` when resuming. */
export type LegacyBulkImportWizardStep = "assets";

/** @deprecated Old jobs used `review` before submit was split out; resume as `review`. */
export type DeprecatedBulkImportWizardStep = never;

/** @deprecated Old jobs used a combined metadata step; resume at `conference`. */
export type LegacyBulkImportLicenseWizardStep = "metadata";

/** @deprecated Spreadsheet step merged into `review` (supplementary metadata). */
export type LegacyBulkImportSpreadsheetWizardStep = "spreadsheet";

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
    task: "Choose how much metadata we auto-fill from each poster PDF, whether to run ORCID/ROR lookups, and whether to use a 30-day on-site review period before Zenodo.",
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
    task: "Download and import the batch workbook to add or correct metadata. Use the poster previews below as reference while you work.",
  },
  {
    id: "preview",
    label: "View metadata",
    task: "Preview the poster.json that will accompany each poster file before you publish or download.",
  },
  {
    id: "publish",
    label: "Submit",
    task: "Choose Zenodo, Figshare, or local download, then submit each completed poster in this batch.",
  },
];

export const BULK_IMPORT_NAME_MIN_LENGTH = 2;
export const BULK_IMPORT_NAME_MAX_LENGTH = 120;

export function normalizeBulkImportWizardStep(
  step: string | undefined | null,
): BulkImportWizardStep | undefined {
  if (!step) return undefined;
  if (step === "assets") return "upload";
  if (step === "metadata") return "conference";
  if (step === "spreadsheet") return "review";
  if (
    step === "setup" ||
    step === "upload" ||
    step === "extraction" ||
    step === "conference" ||
    step === "license" ||
    step === "submit" ||
    step === "review" ||
    step === "preview" ||
    step === "publish"
  ) {
    return step;
  }
  return undefined;
}
