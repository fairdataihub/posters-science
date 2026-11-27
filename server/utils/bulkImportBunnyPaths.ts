export function bulkImportFolderExtension(siteEnv: string | undefined) {
  if (siteEnv === "production") return "p";
  if (siteEnv === "staging") return "s";

  return "d";
}

/**
 * Root folder for one bulk submission: `posters/b/<env>/<jobId>`.
 * Bulk posters live at `posters/b/<env>/<jobId>/<posterId>/<file>`, kept apart
 * from single uploads (`posters/<env>/<uid>/<file>`).
 */
export function bulkImportJobPrefix(folderExtension: string, jobId: string) {
  return `posters/b/${folderExtension}/${jobId}`;
}

export function bulkImportPostersPrefix(
  folderExtension: string,
  jobId: string,
) {
  return `${bulkImportJobPrefix(folderExtension, jobId)}/`;
}

/** Worksheets sent with an "Other platform" request. */
export const CONFERENCE_WORKSHEETS_FOLDER = "conference-worksheets";

export function bulkImportConferenceWorksheetPath(
  folderExtension: string,
  jobId: string,
  fileName: string,
) {
  return `${bulkImportPostersPrefix(folderExtension, jobId)}${CONFERENCE_WORKSHEETS_FOLDER}/${fileName}`;
}

/**
 * Guard deletes so paths cannot escape this job's poster prefix. The
 * conference worksheets folder is not a poster, so poster deletes skip it.
 */
export function isBulkImportPosterObjectPath(
  filePath: string,
  folderExtension: string,
  jobId: string,
): boolean {
  const prefix = bulkImportPostersPrefix(folderExtension, jobId);

  return (
    filePath.startsWith(prefix) &&
    filePath.length > prefix.length &&
    !filePath.startsWith(`${prefix}${CONFERENCE_WORKSHEETS_FOLDER}/`) &&
    !filePath.split("/").includes("..")
  );
}

export function bulkImportPosterObjectPath(
  folderExtension: string,
  jobId: string,
  posterId: number,
  originalFileName: string,
) {
  const safeName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  return `${bulkImportPostersPrefix(folderExtension, jobId)}${posterId}/${safeName}`;
}
