import type ExcelJS from "exceljs";

/** Read cell values from metadata review workbooks (plain text, rich text, formulas). */
export function bulkReviewWorkbookCellText(
  value: ExcelJS.CellValue | null | undefined,
): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    const record = value as unknown as Record<string, unknown>;
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) => {
          if (part && typeof part === "object" && "text" in part) {
            return String((part as { text?: string }).text ?? "");
          }
          return "";
        })
        .join("")
        .trim();
    }
    if ("result" in record && record.result !== undefined) {
      return bulkReviewWorkbookCellText(
        record.result as ExcelJS.CellValue,
      );
    }
    if ("text" in record) {
      return String(record.text ?? "").trim();
    }
  }
  return "";
}
