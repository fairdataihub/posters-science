import type {
  BulkImportValidationIssue,
  BulkImportValidationResult,
} from "#shared/types/bulkImportValidation";

export function bulkImportValidationResult(
  issues: BulkImportValidationIssue[],
): BulkImportValidationResult {
  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

export function mergeBulkImportValidationResults(
  results: BulkImportValidationResult[],
): BulkImportValidationResult {
  return bulkImportValidationResult(results.flatMap((result) => result.issues));
}

/** Run validators in order and combine all issues (extensible for more workbook rules). */
export function runBulkImportMetadataValidation<Context>(
  validators: Array<(context: Context) => BulkImportValidationResult>,
  context: Context,
): BulkImportValidationResult {
  return mergeBulkImportValidationResults(
    validators.map((validate) => validate(context)),
  );
}

export function formatBulkImportValidationMessage(
  result: BulkImportValidationResult,
  options?: { maxIssues?: number },
): string {
  const maxIssues = options?.maxIssues ?? 10;
  const errors = result.issues.filter((issue) => issue.severity === "error");

  if (errors.length === 0) {
    return "The license metadata file could not be validated.";
  }

  const lines = errors.slice(0, maxIssues).map((issue) => issue.message);
  if (errors.length > maxIssues) {
    lines.push(`…and ${errors.length - maxIssues} more issue(s).`);
  }

  return lines.join("\n");
}
