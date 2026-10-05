import licenses from "@/assets/data/licenses.json";

export type ConferenceImportSpreadsheetRow = {
  rowNumber: number;
  fileName: string;
  license: string;
  licenseValid: boolean;
};

const VALID_LICENSE_IDS = new Set(
  licenses.map((license) => license.licenseId.toLowerCase()),
);

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function fileNameColumnIndex(headers: string[]) {
  const match = headers.findIndex((header) =>
    ["filename", "file name", "poster file", "file", "poster filename"].includes(
      header,
    ),
  );
  return match >= 0 ? match : 0;
}

function licenseColumnIndex(headers: string[]) {
  const match = headers.findIndex((header) =>
    ["license", "licence", "spdx", "spdx license", "license id"].includes(
      header,
    ),
  );
  return match >= 0 ? match : 1;
}

/** Minimal CSV parser (quoted fields supported). */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || (char === "\r" && next === "\n")) {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      if (char === "\r") i++;
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

export function parseConferenceImportSpreadsheetCsv(
  text: string,
): ConferenceImportSpreadsheetRow[] {
  const table = parseCsvText(text);
  if (table.length === 0) return [];

  const headers = table[0]!.map(normalizeHeader);
  const fileIdx = fileNameColumnIndex(headers);
  const licenseIdx = licenseColumnIndex(headers);

  return table.slice(1).flatMap((cells, index) => {
    const fileName = (cells[fileIdx] ?? "").trim();
    const license = (cells[licenseIdx] ?? "").trim();
    if (!fileName && !license) return [];

    return [
      {
        rowNumber: index + 2,
        fileName,
        license,
        licenseValid: VALID_LICENSE_IDS.has(license.toLowerCase()),
      },
    ];
  });
}

function escapeCsvField(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function conferenceImportSpreadsheetTemplateCsv() {
  return [
    "file_name,license",
    "smith-2026-poster.pdf,CC-BY-4.0",
    "lee-2026-poster.png,CC0-1.0",
  ].join("\n");
}

export function conferenceImportSpreadsheetRowsFromFileNames(
  fileNames: string[],
): ConferenceImportSpreadsheetRow[] {
  const uniqueNames = [...new Set(fileNames.map((name) => name.trim()))].filter(
    Boolean,
  );

  return uniqueNames.map((fileName, index) => ({
    rowNumber: index + 2,
    fileName,
    license: "",
    licenseValid: false,
  }));
}

export function conferenceImportSpreadsheetCsvFromFileNames(fileNames: string[]) {
  const uniqueNames = [...new Set(fileNames.map((name) => name.trim()))].filter(
    Boolean,
  );

  return [
    "file_name,license",
    ...uniqueNames.map((fileName) => `${escapeCsvField(fileName)},`),
  ].join("\n");
}

export async function readConferenceImportSpreadsheetFile(
  file: File,
): Promise<{ rows: ConferenceImportSpreadsheetRow[]; error?: string }> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return {
      rows: [],
      error:
        "Excel (.xlsx) upload is not parsed in the browser yet. Export your sheet as CSV and upload that file, or use the template below.",
    };
  }

  if (!name.endsWith(".csv")) {
    return {
      rows: [],
      error: "Upload a CSV file (.csv) with poster file names and licenses.",
    };
  }

  const text = await file.text();
  return { rows: parseConferenceImportSpreadsheetCsv(text) };
}
