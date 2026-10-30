import type ExcelJS from "exceljs";
import {
  BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW,
  BULK_REVIEW_WORKBOOK_LOCKED_FILL_KEYS,
  type BulkReviewWorkbookColumn,
} from "#shared/bulkReviewWorkbookManifest";

const LOCKED_FILL_KEYS = new Set<string>(BULK_REVIEW_WORKBOOK_LOCKED_FILL_KEYS);

/** Reserve editable rows below the header block for large batches. */
const PROTECTED_DATA_ROW_RESERVE = 2000;

export function applyBulkReviewWorkbookSheetProtection(
  sheet: ExcelJS.Worksheet,
  columns: BulkReviewWorkbookColumn[],
) {
  const lockedColumnNumbers = new Set<number>();
  columns.forEach((col, index) => {
    if (LOCKED_FILL_KEYS.has(col.fillKey)) {
      lockedColumnNumbers.add(index + 1);
    }
  });

  const lastRow = Math.max(
    sheet.rowCount,
    BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW + PROTECTED_DATA_ROW_RESERVE - 1,
  );

  const hasLockedColumns = lockedColumnNumbers.size > 0;

  for (let rowNumber = BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    for (let colNumber = 1; colNumber <= columns.length; colNumber++) {
      const cell = row.getCell(colNumber);
      if (hasLockedColumns) {
        cell.protection = {
          locked: lockedColumnNumbers.has(colNumber),
        };
      }
      const col = columns[colNumber - 1];
      cell.alignment = {
        vertical: "top",
        ...(col?.wrapText ? { wrapText: true } : {}),
      };
    }
  }

  if (!hasLockedColumns) {
    return;
  }

  void sheet.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
    formatRows: true,
  });
}
