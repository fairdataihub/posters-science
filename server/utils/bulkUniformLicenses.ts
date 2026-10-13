import { join } from "node:path";
import type { BulkImportUniformLicenseOption } from "#shared/types/bulkImportLicenses";
import {
  ACCEPTABLE_LICENSE_LIST_SHEET,
  readXlsxSheetRows,
} from "~~/scripts/lib/version-backfill";

import { BULK_IMPORT_LICENSE_TEMPLATE_RELATIVE_PATH } from "#shared/types/conferenceBulkImport";

const LICENSES_XLSX_RELATIVE_PATH = BULK_IMPORT_LICENSE_TEMPLATE_RELATIVE_PATH;

const SPDX_ID_COLUMN = "license (SPDX id)";
const LICENSE_NAME_COLUMN = "license name";

export function bulkUniformLicenseOptionsFromWorkbook(): BulkImportUniformLicenseOption[] {
  const filePath = join(process.cwd(), LICENSES_XLSX_RELATIVE_PATH);
  const rows = readXlsxSheetRows(filePath, ACCEPTABLE_LICENSE_LIST_SHEET);

  const options: BulkImportUniformLicenseOption[] = [];

  for (const row of rows) {
    const value = row[SPDX_ID_COLUMN]?.trim();
    if (!value) continue;

    const name = row[LICENSE_NAME_COLUMN]?.trim() || value;
    options.push({
      value,
      label: name,
      description: name,
    });
  }

  return options;
}
