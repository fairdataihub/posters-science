// Worksheet files an organizer can send to the team ("Send it to us" in
// the worksheet rejection dialog). Checked by the platform-request route.

export const MAX_CONFERENCE_WORKSHEET_FILES = 5;
export const MAX_CONFERENCE_WORKSHEET_BYTES = 10 * 1024 * 1024;

const WORKSHEET_EXTENSIONS = [
  "xlsx",
  "xlsm",
  "xls",
  "csv",
  "tsv",
  "json",
  "xml",
];

export const CONFERENCE_WORKSHEET_ACCEPT = WORKSHEET_EXTENSIONS.map(
  (ext) => `.${ext}`,
).join(",");

/** Why a worksheet file can't be sent, or null when it can. */
export function conferenceWorksheetRejection(file: {
  name: string;
  size: number;
}): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!WORKSHEET_EXTENSIONS.includes(ext)) {
    return "Use a spreadsheet, CSV, TSV, JSON or XML file.";
  }
  if (file.size > MAX_CONFERENCE_WORKSHEET_BYTES) {
    return "Files can be up to 10 MB.";
  }

  return null;
}
