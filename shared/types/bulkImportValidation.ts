export type BulkImportValidationSeverity = "error" | "warning";

export type BulkImportValidationIssue = {
  code: string;
  message: string;
  severity: BulkImportValidationSeverity;
  /** Excel row number (1-based), when applicable */
  rowNumber?: number;
  fileName?: string;
  field?: string;
};

export type BulkImportValidationResult = {
  valid: boolean;
  issues: BulkImportValidationIssue[];
};
