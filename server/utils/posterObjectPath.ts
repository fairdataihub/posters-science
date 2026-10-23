import { createId } from "@paralleldrive/cuid2";
import { bulkImportFolderExtension } from "./bulkImportBunnyPaths";

/** Matches the extraction service rule for `pdf_path` / thumbnail generation. */
const THUMBNAIL_SERVICE_POSTER_PATH =
  /^posters\/[psd]\/[^/]+(?:\/version-\d+-\d+)?\/[^/]+\.(pdf|jpg|jpeg|png)$/i;

export function isThumbnailServicePosterPath(filePath: string): boolean {
  return THUMBNAIL_SERVICE_POSTER_PATH.test(filePath.trim());
}

/**
 * Bulk import stores files under `bulk-imports/...`, which the extraction
 * thumbnail API rejects. Copy into the canonical `posters/<env>/...` layout once
 * and persist the new path on the extraction job.
 */
export async function ensureThumbnailServicePosterPath(
  posterId: number,
  filePath: string,
): Promise<{ ok: true; filePath: string } | { ok: false; error: string }> {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return { ok: false, error: "Poster file path is missing" };
  }

  if (isThumbnailServicePosterPath(trimmed)) {
    return { ok: true, filePath: trimmed };
  }

  const config = useRuntimeConfig();
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;

  if (!bunnyPrivateStorage || !bunnyPrivateStorageKey) {
    return { ok: false, error: "Poster storage is not configured" };
  }

  const siteEnv = config.siteEnv || config.public?.siteEnv;
  const folderExtension = bulkImportFolderExtension(
    typeof siteEnv === "string" ? siteEnv : undefined,
  );

  const fileName = trimmed.split("/").pop() ?? "poster.pdf";
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const destPath = `posters/${folderExtension}/${createId()}/${safeName}`;

  const sourceUrl = `${bunnyPrivateStorage}/${trimmed}`;

  let downloadRes: Response;
  try {
    downloadRes = await fetch(sourceUrl, {
      headers: { AccessKey: bunnyPrivateStorageKey },
    });
  } catch {
    return { ok: false, error: "Could not read poster file from storage" };
  }

  if (!downloadRes.ok) {
    return { ok: false, error: "Could not read poster file from storage" };
  }

  const body = await downloadRes.arrayBuffer();
  const contentType =
    downloadRes.headers.get("Content-Type") ?? "application/pdf";

  let uploadRes: Response;
  try {
    uploadRes = await fetch(`${bunnyPrivateStorage}/${destPath}`, {
      method: "PUT",
      headers: {
        AccessKey: bunnyPrivateStorageKey,
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
      },
      body,
    });
  } catch {
    return {
      ok: false,
      error: "Could not prepare poster file for thumbnail generation",
    };
  }

  if (!uploadRes.ok) {
    return {
      ok: false,
      error: "Could not prepare poster file for thumbnail generation",
    };
  }

  await prisma.extractionJob.updateMany({
    where: { posterId },
    data: { filePath: destPath },
  });

  console.log(
    `[posterObjectPath] Copied poster ${posterId} file to ${destPath} for thumbnail pipeline`,
  );

  return { ok: true, filePath: destPath };
}
