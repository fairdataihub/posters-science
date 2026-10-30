import type ExcelJS from "exceljs";
import type { BulkReviewWorkbookColumn } from "#shared/bulkReviewWorkbookManifest";
import {
  BULK_REVIEW_WORKBOOK_HEADER_ROW,
  BULK_REVIEW_WORKBOOK_INSTRUCTION_ROW,
  BULK_REVIEW_WORKBOOK_REQUIREMENT_ROW,
  bulkReviewWorkbookColumnFillArgb,
  bulkReviewWorkbookRequirementRowValues,
} from "#shared/bulkReviewWorkbookManifest";

export const BULK_REVIEW_WORKBOOK_MAX_WRAP_COLUMN_WIDTH = 80;

const DEFAULT_ROW_HEIGHT = 15;
const POINTS_PER_WRAP_LINE = 15;
const DEFAULT_EMPTY_WRAP_ROW_HEIGHT = 30;

function cellText(value: ExcelJS.CellValue | string | number | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value) {
    return String((value as { text?: string }).text ?? "");
  }
  return "";
}

export function estimateWrappedLineCount(
  text: string,
  columnWidth: number,
): number {
  if (!text) return 1;
  const charsPerLine = Math.max(1, Math.floor(columnWidth * 0.9));
  return text.split(/\r?\n/).reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)),
    0,
  );
}

function effectiveColumnWidth(col: BulkReviewWorkbookColumn): number {
  const width = col.width ?? 36;
  return Math.min(BULK_REVIEW_WORKBOOK_MAX_WRAP_COLUMN_WIDTH, width);
}

export function applyBulkReviewWorkbookColumnWidths(
  sheet: ExcelJS.Worksheet,
  columns: BulkReviewWorkbookColumn[],
) {
  columns.forEach((col, index) => {
    const column = sheet.getColumn(index + 1);
    const rawWidth =
      col.width ??
      Math.min(
        BULK_REVIEW_WORKBOOK_MAX_WRAP_COLUMN_WIDTH,
        Math.max(14, Math.ceil(col.header.length * 1.15) + 4),
      );
    column.width = col.wrapText
      ? Math.min(BULK_REVIEW_WORKBOOK_MAX_WRAP_COLUMN_WIDTH, rawWidth)
      : rawWidth;
  });
}

/** Rows 2–3: column instructions (share UI) and Required/Optional labels. */
export function applyBulkReviewWorkbookMetaRows(
  sheet: ExcelJS.Worksheet,
  columns: BulkReviewWorkbookColumn[],
) {
  const instructionRow = sheet.getRow(BULK_REVIEW_WORKBOOK_INSTRUCTION_ROW);
  let maxInstructionLines = 1;

  columns.forEach((col, index) => {
    const cell = instructionRow.getCell(index + 1);
    const text = col.instruction ?? "";
    cell.value = text;
    cell.alignment = { vertical: "top", wrapText: true };
    cell.font = { italic: true, size: 9 };
    maxInstructionLines = Math.max(
      maxInstructionLines,
      estimateWrappedLineCount(text, effectiveColumnWidth(col)),
    );
  });

  instructionRow.height = Math.min(
    409,
    Math.max(DEFAULT_ROW_HEIGHT, maxInstructionLines * POINTS_PER_WRAP_LINE),
  );

  const requirementRow = sheet.getRow(BULK_REVIEW_WORKBOOK_REQUIREMENT_ROW);
  bulkReviewWorkbookRequirementRowValues(columns).forEach((label, index) => {
    const cell = requirementRow.getCell(index + 1);
    cell.value = label;
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.font = { bold: true };
    const col = columns[index];
    if (col) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bulkReviewWorkbookColumnFillArgb(col.tier) },
      };
    }
  });

  sheet.getRow(BULK_REVIEW_WORKBOOK_HEADER_ROW).eachCell((cell, colNumber) => {
    const tier = columns[colNumber - 1]?.tier;
    if (tier) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bulkReviewWorkbookColumnFillArgb(tier) },
      };
    }
  });
}

/** After writing cell values: top-align every cell; wrap and grow row height where needed. */
export function applyBulkReviewWorkbookDataRowLayout(
  row: ExcelJS.Row,
  columns: BulkReviewWorkbookColumn[],
  values?: Record<string, string | number | undefined>,
) {
  let maxLines = 1;
  const hasWrapColumn = columns.some((col) => col.wrapText);

  columns.forEach((col, index) => {
    const cell = row.getCell(index + 1);
    const wrap = Boolean(col.wrapText);
    cell.alignment = {
      vertical: "top",
      ...(wrap ? { wrapText: true } : {}),
    };

    if (!wrap) return;

    const fromValues = values?.[col.fillKey];
    const text =
      fromValues !== undefined
        ? cellText(fromValues)
        : cellText(cell.value as ExcelJS.CellValue);
    maxLines = Math.max(
      maxLines,
      estimateWrappedLineCount(text, effectiveColumnWidth(col)),
    );
  });

  if (!hasWrapColumn) return;

  row.height = Math.min(
    409,
    Math.max(
      DEFAULT_ROW_HEIGHT,
      maxLines * POINTS_PER_WRAP_LINE,
    ),
  );
}

/** Empty template rows: top-align all cells; wrap + taller rows where configured. */
export function applyBulkReviewWorkbookDataRowDefaults(
  sheet: ExcelJS.Worksheet,
  columns: BulkReviewWorkbookColumn[],
  fromRow: number,
  toRow: number,
) {
  const hasWrapColumn = columns.some((col) => col.wrapText);
  const defaultHeight = hasWrapColumn ? DEFAULT_EMPTY_WRAP_ROW_HEIGHT : undefined;

  for (let rowNumber = fromRow; rowNumber <= toRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    columns.forEach((col, index) => {
      const cell = row.getCell(index + 1);
      cell.alignment = {
        vertical: "top",
        ...(col.wrapText ? { wrapText: true } : {}),
      };
    });
    if (defaultHeight != null) {
      row.height = defaultHeight;
    }
  }
}
