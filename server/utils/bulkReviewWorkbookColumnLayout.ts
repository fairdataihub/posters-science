import type ExcelJS from "exceljs";
import type { BulkReviewWorkbookColumn } from "#shared/bulkReviewWorkbookManifest";

export function applyBulkReviewWorkbookColumnWidths(
  sheet: ExcelJS.Worksheet,
  columns: BulkReviewWorkbookColumn[],
) {
  columns.forEach((col, index) => {
    const column = sheet.getColumn(index + 1);
    column.width =
      col.width ??
      Math.min(36, Math.max(14, Math.ceil(col.header.length * 1.15) + 4));
  });
}
