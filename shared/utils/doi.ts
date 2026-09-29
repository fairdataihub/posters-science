/**
 * Strips a doi.org URL down to the bare DOI. Anything that is not a doi.org URL
 * is returned trimmed but otherwise untouched.
 */
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
