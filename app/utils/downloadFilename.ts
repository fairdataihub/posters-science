/**
 * File name from a Content-Disposition header. Prefers the UTF-8
 * `filename*=UTF-8''…` form (non-ASCII poster titles), then `filename="…"`.
 */
export function downloadFilenameFromDisposition(
  disposition: string | null | undefined,
): string | undefined {
  if (!disposition) return undefined;

  const extended = disposition.match(/filename\*\s*=\s*UTF-8''([^;\n]+)/i);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // Fall through to the plain filename.
    }
  }

  const plain = disposition.match(/filename\s*=\s*"?([^";\n]+)"?/i);
  return plain?.[1]?.trim() || undefined;
}
