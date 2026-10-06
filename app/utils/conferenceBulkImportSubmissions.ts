import type {
  BulkImportSubmissionRow,
  BulkImportSubmissionRowStatus,
} from "#shared/types/conferenceBulkImport";
import type { ConferenceImportSpreadsheetRow } from "~/utils/conferenceImportSpreadsheet";

function normalizeFileName(name: string) {
  return name.trim();
}

function rowStatus(
  fileName: string,
  license: string,
  licenseValid: boolean,
  filePresent: boolean,
): BulkImportSubmissionRowStatus {
  if (!filePresent) return "missing_file";
  if (!license.trim()) return "missing_license";
  if (!licenseValid) return "invalid_license";
  return "ready";
}

export function buildSubmissionRowsFromSeparateUpload(input: {
  spreadsheetRows: ConferenceImportSpreadsheetRow[];
  posterFileNames: string[];
}): BulkImportSubmissionRow[] {
  const posterSet = new Set(
    input.posterFileNames.map((name) => normalizeFileName(name)),
  );
  const seenFiles = new Set<string>();
  const rows: BulkImportSubmissionRow[] = [];

  for (const sheetRow of input.spreadsheetRows) {
    const fileName = sheetRow.fileName.trim();
    if (!fileName) continue;

    const key = normalizeFileName(fileName);
    seenFiles.add(key);
    const filePresent = posterSet.has(key);

    rows.push({
      id: `sheet-${sheetRow.rowNumber}`,
      rowNumber: sheetRow.rowNumber,
      fileName,
      license: sheetRow.license.trim(),
      filePresent,
      status: rowStatus(
        fileName,
        sheetRow.license,
        sheetRow.licenseValid,
        filePresent,
      ),
    });
  }

  for (const name of input.posterFileNames) {
    const key = normalizeFileName(name);
    if (seenFiles.has(key)) continue;

    rows.push({
      id: `orphan-${encodeURIComponent(key)}`,
      rowNumber: 0,
      fileName: name,
      license: "",
      filePresent: true,
      status: "missing_license",
    });
  }

  return rows.sort((a, b) =>
    a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" }),
  );
}

/** Placeholder rows until the server unpacks a prepared ZIP. */
export function buildSubmissionRowsForZipBundle(zipFileName: string) {
  return [
    {
      id: "zip-bundle",
      rowNumber: 1,
      fileName: zipFileName,
      license: "See license_metadata in ZIP",
      filePresent: true,
      status: "pending_unpack" as const,
    },
  ] satisfies BulkImportSubmissionRow[];
}

export function submissionRowStatusLabel(
  status: BulkImportSubmissionRowStatus,
): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "missing_file":
      return "Missing poster file";
    case "missing_license":
      return "Missing license";
    case "invalid_license":
      return "Invalid SPDX license";
    case "pending_unpack":
      return "Pending unpack";
  }
}

export function submissionRowStatusColor(
  status: BulkImportSubmissionRowStatus,
): "success" | "warning" | "error" | "info" | "neutral" {
  switch (status) {
    case "ready":
      return "success";
    case "pending_unpack":
      return "info";
    case "missing_license":
    case "missing_file":
      return "warning";
    case "invalid_license":
      return "error";
    default:
      return "neutral";
  }
}

export function countSubmissionRowsByStatus(rows: BulkImportSubmissionRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<BulkImportSubmissionRowStatus, number>>,
  );
}
