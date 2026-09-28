// Single source of truth for the poster files we accept on upload. Keep the UI,
// `POST /api/upload/bunny`, and `POST /api/poster/:id/versions` in sync by
// importing from here instead of redefining the limits locally.

export const MAX_POSTER_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_POSTER_FILE_SIZE_LABEL = "10MB";

// Extension -> the MIME type a browser is expected to report for it.
export const ALLOWED_POSTER_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

// Human readable list for error messages and helper text.
export const ALLOWED_POSTER_FILE_LABEL = "PDF, JPEG or PNG";

// `accept` attribute for the native file picker. Extensions and MIME types are
// both listed because some platforms only honor one of them.
export const POSTER_FILE_ACCEPT = [
  ...new Set(Object.values(ALLOWED_POSTER_FILE_TYPES)),
  ...Object.keys(ALLOWED_POSTER_FILE_TYPES).map((ext) => `.${ext}`),
].join(",");

// Browsers and OS file pickers sometimes report no type at all, so fall back to
// trusting the extension rather than rejecting a legitimate poster.
const GENERIC_UPLOAD_TYPES = new Set(["", "application/octet-stream"]);

export function posterFileExtension(name: string): string {
  const parts = name.trim().toLowerCase().split(".");

  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

export function isAllowedPosterFile(name: string, type: string): boolean {
  const expectedType = ALLOWED_POSTER_FILE_TYPES[posterFileExtension(name)];
  const normalizedType = type.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  return Boolean(
    expectedType &&
    (normalizedType === expectedType ||
      GENERIC_UPLOAD_TYPES.has(normalizedType)),
  );
}

// Returns a user facing reason the file cannot be uploaded, or null when it is
// allowed. Size is optional so server callers can validate a name/type pair
// before the body has been read.
export function posterFileRejectionReason(file: {
  name: string;
  type: string;
  size?: number;
}): string | null {
  if (!isAllowedPosterFile(file.name, file.type)) {
    return `Unsupported file type. Upload a ${ALLOWED_POSTER_FILE_LABEL} file.`;
  }

  if (file.size !== undefined && file.size > MAX_POSTER_FILE_SIZE_BYTES) {
    return `File is too large. Maximum size is ${MAX_POSTER_FILE_SIZE_LABEL}.`;
  }

  if (file.size === 0) {
    return "File is empty. Choose a different file.";
  }

  return null;
}
