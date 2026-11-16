/**
 * Mirrors the extraction service's `/thumbnails/generate` `file_path` rule:
 *   posters/<env>/<uid>[/version-<seq>-<id>]/<file>
 *   posters/b/<env>/<jobId>/<posterId>[/version-<seq>-<id>]/<file>   (bulk)
 * Keep in sync with `_FILE_PATH_RE` in posters-science-extraction-api/api.py.
 */
const THUMBNAIL_SERVICE_POSTER_PATH =
  /^posters\/(?:b\/[a-z]+\/[a-zA-Z0-9_-]{8,40}\/\d+|[a-z]+\/[a-zA-Z0-9_-]{8,40})\/(?:version-\d+-[a-zA-Z0-9_-]{8,40}\/)?[^/]+\.(pdf|jpg|jpeg|png)$/;

export function isThumbnailServicePosterPath(filePath: string): boolean {
  return THUMBNAIL_SERVICE_POSTER_PATH.test(filePath.trim());
}

/** Validates a poster's storage path before handing it to the thumbnail service. */
export function resolveThumbnailServicePosterPath(
  filePath: string,
): { ok: true; filePath: string } | { ok: false; error: string } {
  const trimmed = filePath.trim();

  if (!trimmed) {
    return { ok: false, error: "Poster file path is missing" };
  }

  if (!isThumbnailServicePosterPath(trimmed)) {
    return {
      ok: false,
      error: "Poster file path is not in a supported location",
    };
  }

  return { ok: true, filePath: trimmed };
}
