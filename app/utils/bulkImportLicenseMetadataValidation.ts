import type {
  BulkImportValidationIssue,
  BulkImportValidationResult,
} from "#shared/types/bulkImportValidation";
import {
  bulkImportValidationResult,
  runBulkImportMetadataValidation,
} from "#shared/utils/bulkImportValidation";
import { buildSubmissionRowsFromSeparateUpload } from "~/utils/conferenceBulkImportSubmissions";
import type { ConferenceImportSpreadsheetRow } from "~/utils/conferenceImportSpreadsheet";

export type BulkImportLicenseMetadataValidationContext = {
  spreadsheetRows: ConferenceImportSpreadsheetRow[];
  posterFileNames: string[];
};

function submissionRowIssueMessage(
  status: string,
  fileName: string,
): string {
  switch (status) {
    case "missing_license":
      return `Poster "${fileName}" is missing a license (SPDX id).`;
    case "invalid_license":
      return `Poster "${fileName}" has an invalid or unrecognized SPDX license id.`;
    case "missing_file":
      return `Spreadsheet lists "${fileName}" but that file is not in this import batch.`;
    default:
      return `Poster "${fileName}" is not ready to import (${status}).`;
  }
}

export function validateBulkImportLicenseMetadata(
  context: BulkImportLicenseMetadataValidationContext,
): BulkImportValidationResult {
  const issues: BulkImportValidationIssue[] = [];

  if (context.posterFileNames.length === 0) {
    issues.push({
      code: "no_staged_posters",
      severity: "error",
      message:
        "Upload poster files before importing a license workbook.",
    });
    return bulkImportValidationResult(issues);
  }

  const populatedRows = context.spreadsheetRows.filter(
    (row) => row.fileName.trim() || row.license.trim(),
  );

  if (populatedRows.length === 0) {
    issues.push({
      code: "empty_license_metadata",
      severity: "error",
      message:
        'The Licenses sheet is empty. Add a license (SPDX id) for each poster file name.',
    });
    return bulkImportValidationResult(issues);
  }

  for (const sheetRow of context.spreadsheetRows) {
    if (!sheetRow.fileName.trim() && sheetRow.license.trim()) {
      issues.push({
        code: "missing_poster_filename",
        severity: "error",
        rowNumber: sheetRow.rowNumber,
        field: "Poster Filename",
        message: `Row ${sheetRow.rowNumber}: enter a poster file name for the license "${sheetRow.license.trim()}".`,
      });
    }
  }

  const rowNumbersByFileName = new Map<string, number[]>();
  for (const sheetRow of context.spreadsheetRows) {
    const fileName = sheetRow.fileName.trim();
    if (!fileName) continue;

    const existing = rowNumbersByFileName.get(fileName) ?? [];
    existing.push(sheetRow.rowNumber);
    rowNumbersByFileName.set(fileName, existing);
  }

  for (const [fileName, rowNumbers] of rowNumbersByFileName) {
    if (rowNumbers.length <= 1) continue;

    issues.push({
      code: "duplicate_poster_filename",
      severity: "error",
      fileName,
      message: `Poster file name "${fileName}" appears on rows ${rowNumbers.join(", ")}. Use one row per poster.`,
    });
  }

  const submissionRows = buildSubmissionRowsFromSeparateUpload({
    spreadsheetRows: context.spreadsheetRows,
    posterFileNames: context.posterFileNames,
  });

  for (const row of submissionRows) {
    if (row.status === "ready") continue;

    issues.push({
      code: row.status,
      severity: "error",
      fileName: row.fileName,
      rowNumber: row.rowNumber > 0 ? row.rowNumber : undefined,
      field: "Poster License (SPDX id)",
      message: row.rowNumber > 0
        ? `Row ${row.rowNumber}: ${submissionRowIssueMessage(row.status, row.fileName)}`
        : submissionRowIssueMessage(row.status, row.fileName),
    });
  }

  return bulkImportValidationResult(issues);
}

/** Add future per-poster workbook validators to this list. */
export const bulkImportPerPosterLicenseMetadataValidators = [
  validateBulkImportLicenseMetadata,
] as const;

export function validateBulkImportPerPosterLicenseMetadata(
  context: BulkImportLicenseMetadataValidationContext,
): BulkImportValidationResult {
  return runBulkImportMetadataValidation(
    [...bulkImportPerPosterLicenseMetadataValidators],
    context,
  );
}
