const DOI_REGEX = /^10\.\d{4,9}\/.+$/i;

export function normalizeDoi(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    if (url.hostname === "doi.org" || url.hostname === "www.doi.org") {
      return url.pathname.replace(/^\//, "");
    }
  } catch {
    // not a URL, use as-is
  }
  return trimmed;
}

export function validateDoi(input: string): string {
  if (!input) return "";
  const normalized = normalizeDoi(input);
  if (!DOI_REGEX.test(normalized)) {
    return "Please enter a valid DOI (e.g. 10.5281/zenodo.1234567) or a doi.org URL.";
  }
  return "";
}
