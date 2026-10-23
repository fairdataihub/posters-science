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
    task: "Specify a name for your batch of posters. This name will appear in your dashboard so you can easily return to it later.",
  },
  {
    id: "upload",
    label: "Posters",
    task: "Use the interface below to drag and drop or import all of your posters.",
  },
  {
    id: "extraction",
    label: "Poster details",
    task: "Choose extraction settings, ORCID/ROR lookups, and whether to embargo posters for on-site review before Zenodo.",
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
    label: "Submit posters",
    task: "Submit your posters so we can extract metadata from each file.",
  },
  {
    id: "review",
    label: "Review metadata",
    task: "Review extracted metadata for each poster, then open the full editor to correct anything before publishing.",
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
