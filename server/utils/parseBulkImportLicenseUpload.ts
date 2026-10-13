import { BULK_IMPORT_LICENSES_SHEET_NAME } from "#shared/types/conferenceBulkImport";
import { readXlsxSheetRowsFromBuffer } from "~~/scripts/lib/version-backfill";
import {
  conferenceImportSpreadsheetRowsFromLicenseSheetRecords,
  parseConferenceImportSpreadsheetCsv,
  type ConferenceImportSpreadsheetRow,
} from "~/utils/conferenceImportSpreadsheet";

export function parseBulkImportLicenseUpload(input: {
  fileName: string;
  data: Buffer;
}): { rows: ConferenceImportSpreadsheetRow[]; error?: string } {
  const lower = input.fileName.toLowerCase();

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    try {
      const records = readXlsxSheetRowsFromBuffer(
        input.data,
        BULK_IMPORT_LICENSES_SHEET_NAME,
      );
      return {
        rows: conferenceImportSpreadsheetRowsFromLicenseSheetRecords(records),
      };
    } catch (error) {
      return {
        rows: [],
        error:
          error instanceof Error
            ? error.message
            : "Could not read license.xlsx",
      };
    }
  }

  if (lower.endsWith(".csv")) {
    const text = input.data.toString("utf8");
    return { rows: parseConferenceImportSpreadsheetCsv(text) };
  }

  return {
    rows: [],
    error: "Upload license.xlsx (Excel) from the download button.",
  };
}
