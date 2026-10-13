import { join } from "node:path";
import ExcelJS from "exceljs";
import {
  BULK_IMPORT_LICENSE_TEMPLATE_RELATIVE_PATH,
  BULK_IMPORT_LICENSES_SHEET_NAME,
} from "#shared/types/conferenceBulkImport";

const LICENSE_DATA_START_ROW = 2;

function uniquePosterFileNames(fileNames: string[]) {
  return [...new Set(fileNames.map((name) => name.trim()))].filter(Boolean);
}

export async function buildFilledBulkImportLicenseXlsx(
  posterFileNames: string[],
): Promise<Buffer> {
  const templatePath = join(process.cwd(), BULK_IMPORT_LICENSE_TEMPLATE_RELATIVE_PATH);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const sheet = workbook.getWorksheet(BULK_IMPORT_LICENSES_SHEET_NAME);
  if (!sheet) {
    throw new Error(
      `License template is missing the "${BULK_IMPORT_LICENSES_SHEET_NAME}" sheet`,
    );
  }

  const names = uniquePosterFileNames(posterFileNames);
  const styleSourceRow = sheet.getRow(LICENSE_DATA_START_ROW);

  for (let index = 0; index < names.length; index++) {
    const rowNumber = LICENSE_DATA_START_ROW + index;
    const row = sheet.getRow(rowNumber);

    if (rowNumber > LICENSE_DATA_START_ROW) {
      row.height = styleSourceRow.height;
      styleSourceRow.eachCell({ includeEmpty: true }, (sourceCell, colNumber) => {
        const targetCell = row.getCell(colNumber);
        targetCell.style = { ...sourceCell.style };
      });
    }

    row.getCell(1).value = names[index]!;
    row.getCell(2).value = null;
    row.commit();
  }

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
