/**
 * Generates public/bulk-submission-templates/metadata-review.xlsx from
 * shared/bulkReviewWorkbookManifest.ts
 *
 * Run: pnpm scripts:generate-bulk-review-template
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import {
  BULK_IMPORT_METADATA_REVIEW_TEMPLATE_RELATIVE_PATH,
  BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW,
  BULK_REVIEW_WORKBOOK_HEADER_ROW,
  BULK_REVIEW_WORKBOOK_SHEETS,
  bulkReviewWorkbookRequirementRowLabel,
} from "../shared/bulkReviewWorkbookManifest.ts";
import { applyBulkReviewWorkbookSheetProtection } from "../server/utils/bulkReviewWorkbookSheetProtection.ts";
import {
  applyBulkReviewWorkbookColumnWidths,
  applyBulkReviewWorkbookDataRowDefaults,
  applyBulkReviewWorkbookMetaRows,
} from "../server/utils/bulkReviewWorkbookColumnLayout.ts";

const PROTECTED_DATA_ROW_RESERVE = 2000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, BULK_IMPORT_METADATA_REVIEW_TEMPLATE_RELATIVE_PATH);

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", wrapText: true };
}

function addDataSheet(
  workbook: ExcelJS.Workbook,
  sheetDef: (typeof BULK_REVIEW_WORKBOOK_SHEETS)[number],
) {
  const sheet = workbook.addWorksheet(sheetDef.name, {
    views: [
      { state: "frozen", ySplit: BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW - 1 },
    ],
  });

  const headers = sheetDef.columns.map((col) => col.header);
  sheet.addRow(headers);
  sheet.addRow(sheetDef.columns.map((col) => col.instruction ?? ""));
  sheet.addRow(
    sheetDef.columns.map((col) => bulkReviewWorkbookRequirementRowLabel(col.tier)),
  );

  styleHeaderRow(sheet.getRow(BULK_REVIEW_WORKBOOK_HEADER_ROW));

  applyBulkReviewWorkbookColumnWidths(sheet, sheetDef.columns);
  applyBulkReviewWorkbookMetaRows(sheet, sheetDef.columns);

  applyBulkReviewWorkbookDataRowDefaults(
    sheet,
    sheetDef.columns,
    BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW,
    BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW + PROTECTED_DATA_ROW_RESERVE - 1,
  );

  applyBulkReviewWorkbookSheetProtection(sheet, sheetDef.columns);

  return sheet;
}

function addInstructionsSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Instructions", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 88;

  const lines: [string, string][] = [
    [
      "purpose",
      "Bulk metadata review workbook aligned with Posters.science poster.json and the single-poster Review Metadata UI.",
    ],
    [
      "keys",
      "Join rows with Poster ID. Copy Poster ID and File name when adding rows on child sheets.",
    ],
    [
      "keywords",
      "On About the Poster, use semicolon-separated keywords (e.g. Machine Learning; Diabetes).",
    ],
    [
      "creators",
      "Creators: one row per author with ORCID and Affiliation 1–30 (+ ROR). Additional information: one row per poster (abstract, language, domain). Related resources, Funding, Poster content, Table captions, and Image captions are separate sheets.",
    ],
    [
      "links_and_content",
      "Poster content is section title + section content only. Figure and table text goes on Image captions and Table captions.",
    ],
    [
      "data_rows",
      `Data starts on row ${BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW} on each sheet. Row 1 is the column title; row 2 has field instructions (same as the single-poster metadata form); row 3 shows Required or Optional.`,
    ],
    [
      "minimal_vs_full",
      "Downloaded workbooks prefill cells according to this batch's extraction setting (see prefill_level when you download). Column colors distinguish required (blue) and optional (gray) fields. Poster ID and File name are reference columns you can copy when adding rows or moving data between sheets.",
    ],
    ["prefill_level", "Set when you download this template for a batch."],
    ["", ""],
    ["Sheet", "Description"],
  ];

  for (const [a, b] of lines) {
    sheet.addRow([a, b]);
  }

  for (const sheetDef of BULK_REVIEW_WORKBOOK_SHEETS) {
    sheet.addRow([sheetDef.name, sheetDef.description]);
  }

  sheet.getRow(1).font = { bold: true };
  const sheetListStart = lines.length;
  sheet.getRow(sheetListStart).font = { bold: true };
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Posters.science";
  workbook.created = new Date();

  addInstructionsSheet(workbook);

  for (const sheetDef of BULK_REVIEW_WORKBOOK_SHEETS) {
    addDataSheet(workbook, sheetDef);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);

  console.log(`Wrote ${BULK_IMPORT_METADATA_REVIEW_TEMPLATE_RELATIVE_PATH}`);
  console.log(`  Sheets: ${workbook.worksheets.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
