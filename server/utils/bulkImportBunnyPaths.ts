export function bulkImportFolderExtension(siteEnv: string | undefined) {
  if (siteEnv === "production") return "p";
  if (siteEnv === "staging") return "s";
  return "d";
}

export function bulkImportJobPrefix(folderExtension: string, jobId: string) {
  return `bulk-imports/${folderExtension}/${jobId}`;
}

export function bulkImportPostersPrefix(folderExtension: string, jobId: string) {
  return `posters/${folderExtension}/b/${jobId}/`;
}

/** Guard deletes so paths cannot escape this job's poster prefix. */
export function isBulkImportPosterObjectPath(
  filePath: string,
  folderExtension: string,
  jobId: string,
): boolean {
  const prefix = bulkImportPostersPrefix(folderExtension, jobId);
  return filePath.startsWith(prefix) && filePath.length > prefix.length;
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

export function bulkImportLicenseMetadataObjectPath(
  folderExtension: string,
  jobId: string,
  basename: string,
  extension: "xlsx" | "csv" = "xlsx",
) {
  return `${bulkImportJobPrefix(folderExtension, jobId)}/${basename}.${extension}`;
}
