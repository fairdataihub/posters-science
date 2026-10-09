import { createId } from "@paralleldrive/cuid2";

export function bulkImportFolderExtension(siteEnv: string | undefined) {
  if (siteEnv === "production") return "p";
  if (siteEnv === "staging") return "s";
  return "d";
}

export function bulkImportJobPrefix(folderExtension: string, jobId: string) {
  return `bulk-imports/${folderExtension}/${jobId}`;
}

export function bulkImportPostersPrefix(folderExtension: string, jobId: string) {
  return `${bulkImportJobPrefix(folderExtension, jobId)}/posters/`;
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
  originalFileName: string,
) {
  const safeName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileId = createId();
  return `${bulkImportJobPrefix(folderExtension, jobId)}/posters/${fileId}/${safeName}`;
}

export function bulkImportLicenseMetadataObjectPath(
  folderExtension: string,
  jobId: string,
  basename: string,
) {
  return `${bulkImportJobPrefix(folderExtension, jobId)}/${basename}.csv`;
}
