/** Ordered steps for the bulk poster import wizard (extend this list as the flow grows). */
export type BulkImportWizardStep =
  | "setup"
  | "upload"
  | "extraction"
  | "conference"
  | "submit";

/** @deprecated Jobs saved on the old flow; map to `upload` when resuming. */
export type LegacyBulkImportWizardStep = "assets";

/** @deprecated Merged into `submit`. */
export type DeprecatedBulkImportWizardStep = "review";

/** @deprecated License step merged into `conference`. */
export type LegacyBulkImportLicenseWizardStep = "metadata";

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
    description: "Batch name for your dashboard",
    task: "Give your bulk posters upload a name that you will recognize on your dashboard.",
  },
  {
    id: "upload",
    label: "Posters",
    description: "Your PDF or image files",
    task: "Add every poster file, then continue.",
  },
  {
    id: "extraction",
    label: "Poster details",
    description: "How we read metadata from files",
    task: "Choose an extraction level and whether to automate ORCID and ROR lookups.",
  },
  {
    id: "conference",
    label: "Conference information",
    description: "License and conference metadata for this batch",
    task: "Choose a license for every poster and enter conference information for this import.",
  },
  {
    id: "submit",
    label: "Submit posters",
    description: "Check files and start import",
    task: "Confirm each poster is ready, then submit the batch.",
  },
];

export const BULK_IMPORT_NAME_MIN_LENGTH = 2;
export const BULK_IMPORT_NAME_MAX_LENGTH = 120;

export function normalizeBulkImportWizardStep(
  step: string | undefined | null,
): BulkImportWizardStep | undefined {
  if (!step) return undefined;
  if (step === "assets") return "upload";
  if (step === "review") return "submit";
  if (step === "metadata") return "conference";
  if (
    step === "setup" ||
    step === "upload" ||
    step === "extraction" ||
    step === "conference" ||
    step === "submit"
  ) {
    return step;
  }
  return undefined;
}
