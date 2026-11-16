const DEFAULT_ZENODO_WEB_BASE = "https://zenodo.org";

function normalizeZenodoWebBase(base = DEFAULT_ZENODO_WEB_BASE): string {
  return base.replace(/\/$/, "");
}

/** Canonical public landing page for a Zenodo record version. */
export function zenodoRecordWebUrl(
  recordId: number,
  zenodoWebBase = DEFAULT_ZENODO_WEB_BASE,
): string {
  return `${normalizeZenodoWebBase(zenodoWebBase)}/records/${recordId}`;
}

/**
 * Turn Zenodo link fields (often relative paths from the RDM API) into a usable
 * browser URL on zenodo.org (or sandbox).
 */
export function normalizeZenodoRecordWebUrl(
  url: string | undefined | null,
  options?: { recordId?: number; zenodoWebBase?: string },
): string | undefined {
  const trimmed = url?.trim();
  if (trimmed && /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const base = normalizeZenodoWebBase(options?.zenodoWebBase);

  if (
    options?.recordId != null &&
    Number.isFinite(options.recordId) &&
    options.recordId > 0
  ) {
    return zenodoRecordWebUrl(options.recordId, base);
  }

  if (!trimmed) return undefined;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${base}${trimmed}`;
  if (/^records\//i.test(trimmed)) return `${base}/${trimmed}`;

  return undefined;
}

import { resolveDoiUrl } from "#shared/utils/doi";

export function zenodoDoiToLandingUrl(
  doi: string | undefined | null,
): string | undefined {
  const trimmed = doi?.trim();
  if (!trimmed) return undefined;
  return resolveDoiUrl(trimmed);
}
