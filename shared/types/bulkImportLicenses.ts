export type BulkImportLicenseMode = "uniform" | "per_poster";

export type BulkImportUniformLicenseOption = {
  value: string;
  label: string;
  description: string;
};

export type BulkImportSubmissionSummary = {
  licenseMode?: BulkImportLicenseMode;
  uniformLicense?: string;
  licenseSpreadsheetRows?: unknown[];
};
