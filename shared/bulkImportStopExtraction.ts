/**
 * Marker saved as the error on extraction jobs the user stopped before the
 * worker started them. The job is stored as "failed" so the worker skips it,
 * but the app shows it as stopped (not as an error) and can resume it.
 */
export const BULK_EXTRACTION_STOPPED_ERROR =
  "Extraction was stopped before this poster was processed.";
