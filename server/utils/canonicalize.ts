// Shared normalization for fields that appear on /metrics and as filter
// options on /discover. Keeping these in one place ensures the dropdown
// options on the search page match the buckets shown on the metrics page.

// Rights statements, "other-*" buckets, and placeholders that aren't real
// licenses. Compared case-insensitively against the canonical (normalized) form.
export const EXCLUDED_LICENSES = new Set([
  "in copyright",
  "copyright not evaluated",
  "copyright undetermined",
  "all rights reserved",
  "other-at",
  "other-open",
  "other-closed",
  "other-pd",
  "other-nc",
  "notspecified",
  "not specified",
  "unknown",
  "n/a",
  "none",
]);

// Catches long free-text values that ended up in the license field by mistake
// (grant acknowledgements, URLs, citations, etc.). Real licenses are short
// identifiers.
const LICENSE_NOISE_PATTERNS: RegExp[] = [
  /\bet\s+al\b/i,
  /\bdoi[:\s]/i,
  /\borcid[:\s]/i,
  /\bgrant\b/i,
  /\bethics\b/i,
  /\bsupported\s+by\b/i,
  /\bsponsored\s+by\b/i,
  /\bfunding\b/i,
  /\bcontact\s+me\b/i,
  /\bconflicts?\s+of\s+interests?\b/i,
  /https?:\/\//i,
  // Catches bare-domain references like "linkedin.com/in/...", "example.com",
  // "site.io/page" that ended up in a license field. Real SPDX-style license
  // identifiers don't contain a dot-TLD substring.
  /\b[a-z0-9-]+\.(com|org|net|io|edu|gov|co|info|biz|app|dev|ai|me)\b/i,
  /^©/,
  /©\s*\d{4}/,
  /\bzenodo\b/i,
  /\barxiv\b/i,
  /@[a-z0-9.-]+\.[a-z]{2,}/i,
];

export function normalizeLicense(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (/cc0|cc-zero|public-domain/.test(s)) return "CC0-1.0";
  if (/^cc-by-nc-nd-4/.test(s) || s === "cc-by-nc-nd") return "CC-BY-NC-ND-4.0";
  if (/^cc-by-nc-sa-4/.test(s) || s === "cc-by-nc-sa") return "CC-BY-NC-SA-4.0";
  if (/^cc-by-nc-4/.test(s) || s === "cc-by-nc") return "CC-BY-NC-4.0";
  if (/^cc-by-nd-4/.test(s) || s === "cc-by-nd") return "CC-BY-ND-4.0";
  if (/^cc-by-sa-4/.test(s) || s === "cc-by-sa") return "CC-BY-SA-4.0";
  if (/^cc-by-4/.test(s) || s === "cc-by") return "CC-BY-4.0";
  if (/apache-?2/.test(s)) return "Apache-2.0";
  if (s === "mit" || s === "mit-license") return "MIT";

  return raw.trim();
}

// True when a license string is junk (free-text grant acknowledgements, URLs,
// citation snippets, "other-*" placeholders, etc.) and should not appear as a
// dropdown option or as a slice on the license chart.
export function isLicenseNoise(raw: string): boolean {
  const t = raw.trim();
  if (t.length === 0) return true;
  // Real SPDX-style license identifiers are short.
  if (t.length > 60) return true;
  if (EXCLUDED_LICENSES.has(t.toLowerCase())) return true;
  if (LICENSE_NOISE_PATTERNS.some((p) => p.test(t))) return true;

  return false;
}

export function cleanPublisherName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\.(com|org|net|io|edu|gov)$/i, "")
    .trim();

  return cleaned || raw.trim();
}

type OrgAlias = {
  canonical: string;
  pattern: RegExp;
  exclude?: RegExp;
  funderOnly?: boolean;
};

const ORG_ALIASES: OrgAlias[] = [
  {
    canonical: "U.S. Environmental Protection Agency",
    pattern: /environmental protection agency/i,
  },
  {
    canonical: "U.S. National Science Foundation",
    pattern: /national science foundation|\bnsf\b|^directorate for /i,
    exclude:
      /swiss|swedish|china|chinese|korea|natural science|meeting|conference|workshop|symposium/i,
    funderOnly: true,
  },
  {
    canonical: "National Institutes of Health",
    pattern: /national institutes? of health|\bnih\b/i,
  },
  {
    // Special case to unify typod entries and formal entries while
    // showing domain ("PosterPresentation s.com", "PosterPresentations.co m")
    canonical: "PosterPresentations.com",
    pattern: /posterpresentation/i,
  },
];

export function canonicalizeOrg(raw: string, isFunder = false): string {
  const cleaned = cleanPublisherName(raw);
  for (const alias of ORG_ALIASES) {
    if (alias.funderOnly && !isFunder) continue;
    if (alias.pattern.test(cleaned) && !alias.exclude?.test(cleaned)) {
      return alias.canonical;
    }
  }

  return cleaned;
}

// Institution names are deduplicated by name only (case-insensitive, trimmed).
// ROR ids are intentionally not used so same-named entries don't split.
export function normalizeInstitution(raw: string): string {
  return raw.trim().toLowerCase();
}

const INSTITUTION_DENYLIST = new Set([
  "institution name",
  "null",
  "unknown",
  "n/a",
  "none",
  "not specified",
  "notspecified",
]);

export function isInstitutionExcluded(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (/^[0-9]+$/.test(trimmed)) return true;
  if (INSTITUTION_DENYLIST.has(trimmed.toLowerCase())) return true;

  return false;
}

export const NULL_CONFERENCE =
  /^(not\s+specified|n\/a|no\s+specified|sin\s+especif[ia]r|none|unknown|not\s+available|unspecified|-)$/i;

const FUNDER_DENYLIST = new Set([
  "unknown funder",
  "unknown",
  "not specified",
  "notspecified",
  "funder",
  "not applicable",
  "n/a",
  "no funding",
  "none",
]);

export function isFunderExcluded(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (FUNDER_DENYLIST.has(trimmed.toLowerCase())) return true;

  return false;
}

// Subjects come from mixed taxonomies (ANZSRC-style Fields of Research, free
// text, etc.). "not elsewhere classified" is a catch-all suffix on real fields
// (e.g. "Artificial intelligence not elsewhere classified") rather than a
// meaningful label on its own, so we strip it and let the remaining field name
// merge with its base subject. Also handles the ", n.e.c." dotted abbreviation.
const NEC_PATTERNS: RegExp[] = [
  /[\s,;:-]*\bnot\s+elsewhere\s+classified\b/gi,
  /[\s,;:-]*\bn\.e\.c\.?\b/gi,
];

export function normalizeSubject(raw: string): string {
  let s = raw;
  for (const p of NEC_PATTERNS) s = s.replace(p, "");

  // Collapse whitespace and trim separators orphaned by the strip above (e.g. a
  // trailing "." left after removing "n.e.c" or "... classified.").
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, "")
    .trim();
}

// True when a subject should not appear in the wordcloud. Empty strings (which
// is what a standalone "not elsewhere classified" collapses to after
// normalizeSubject) are dropped. SUBJECT_DENYLIST is seeded empty and left as
// the single place to add future placeholder terms ("unknown", "n/a", etc.).
const SUBJECT_DENYLIST = new Set<string>([]);

export function isSubjectExcluded(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (SUBJECT_DENYLIST.has(trimmed.toLowerCase())) return true;

  return false;
}
