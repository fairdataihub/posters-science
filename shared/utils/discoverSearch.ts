import { normalizeDoi } from "./doi.ts";
import { quoteSearchValue, tokenizeSearch } from "./searchQuery.ts";

// Public discover search. Unlike admin search it never looks at the poster
// owner or internal ids, only at published metadata.
export const DISCOVER_SEARCH_FIELDS = [
  "title",
  "description",
  "keyword",
  "author",
  "affiliation",
  "doi",
  "conference",
  "orcid",
  "ror",
  "funder",
  "award",
  "content",
] as const;

export type DiscoverSearchField = (typeof DISCOVER_SEARCH_FIELDS)[number];

export const DISCOVER_SEARCH_FIELD_LABELS: Record<DiscoverSearchField, string> =
  {
    title: "Title",
    description: "Description",
    keyword: "Keyword",
    author: "Author",
    affiliation: "Affiliation",
    doi: "DOI",
    conference: "Conference",
    orcid: "ORCID",
    ror: "ROR",
    funder: "Funder",
    award: "Award",
    content: "Poster text",
  };

/** Fields a plain term looks at. Identifiers and poster text need a prefix. */
export const DISCOVER_FREE_TEXT_FIELDS = [
  "title",
  "description",
  "keyword",
  "author",
  "affiliation",
  "doi",
  "conference",
] as const satisfies readonly DiscoverSearchField[];

// Spellings a visitor is likely to reach for, mapped to the canonical field.
const FIELD_ALIASES: Record<string, DiscoverSearchField> = {
  title: "title",
  description: "description",
  desc: "description",
  abstract: "description",
  keyword: "keyword",
  keywords: "keyword",
  subject: "keyword",
  tag: "keyword",
  author: "author",
  creator: "author",
  by: "author",
  affiliation: "affiliation",
  aff: "affiliation",
  institution: "affiliation",
  org: "affiliation",
  doi: "doi",
  conference: "conference",
  conf: "conference",
  event: "conference",
  orcid: "orcid",
  ror: "ror",
  funder: "funder",
  funding: "funder",
  award: "award",
  grant: "award",
  content: "content",
  text: "content",
  body: "content",
};

/** Example queries for the help popover, one per field. */
export const DISCOVER_SEARCH_EXAMPLES: Record<DiscoverSearchField, string> = {
  title: "title:microbiome",
  description: "description:survey",
  keyword: "keyword:genomics",
  author: "author:smith",
  affiliation: "affiliation:stanford",
  doi: "doi:10.5281/zenodo.1234567",
  conference: "conference:ISMB",
  orcid: "orcid:0000-0002-1825-0097",
  ror: "ror:0168r3w48",
  funder: "funder:NIH",
  award: "award:R01",
  content: "content:random forest",
};

export type DiscoverSearchClause = {
  field: DiscoverSearchField;
  term: string;
};

export type ParsedDiscoverSearch = {
  /** Prefixed clauses. Every clause must match. */
  clauses: DiscoverSearchClause[];
  /** Unprefixed words, matched as one phrase against the free text fields. */
  freeText: string;
};

export const EMPTY_DISCOVER_SEARCH: ParsedDiscoverSearch = {
  clauses: [],
  freeText: "",
};

const ORCID_PATTERN = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i;
// ROR ids are a leading 0, six Crockford base32 characters and two check digits.
const ROR_PATTERN = /^0[0-9a-hjkmnp-tv-z]{6}\d{2}$/i;
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/i;

export function normalizeOrcid(input: string): string {
  return input
    .trim()
    .replace(/.*orcid\.org\//i, "")
    .replace(/\/+$/, "")
    .toUpperCase();
}

export function normalizeRor(input: string): string {
  return input
    .trim()
    .replace(/.*ror\.org\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function normalizeTerm(field: DiscoverSearchField, term: string): string {
  switch (field) {
    case "orcid":
      return normalizeOrcid(term);
    case "ror":
      return normalizeRor(term);
    case "doi":
      return normalizeDoi(term);
    default:
      return term.trim();
  }
}

/**
 * Recognises a pasted ORCID, ROR or DOI (bare or as a URL), so a plain search
 * for one goes straight to the matching identifier field.
 */
export function detectIdentifier(term: string): DiscoverSearchClause | null {
  const trimmed = term.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  if (/orcid\.org\//i.test(trimmed) || ORCID_PATTERN.test(trimmed)) {
    const orcid = normalizeOrcid(trimmed);
    if (ORCID_PATTERN.test(orcid)) return { field: "orcid", term: orcid };
  }

  if (/ror\.org\//i.test(trimmed) || ROR_PATTERN.test(trimmed)) {
    const ror = normalizeRor(trimmed);
    if (ROR_PATTERN.test(ror)) return { field: "ror", term: ror };
  }

  const doi = normalizeDoi(trimmed);
  if (DOI_PATTERN.test(doi)) return { field: "doi", term: doi };

  return null;
}

export function parseDiscoverSearch(
  raw: string | null | undefined,
): ParsedDiscoverSearch {
  const tokens = tokenizeSearch(raw, (key) => key in FIELD_ALIASES);
  if (tokens.length === 0) return EMPTY_DISCOVER_SEARCH;

  const clauses: DiscoverSearchClause[] = [];
  const words: string[] = [];

  for (const token of tokens) {
    if (token.key === null) {
      words.push(token.value);
      continue;
    }

    const field = FIELD_ALIASES[token.key]!;
    const term = normalizeTerm(field, token.value);

    // A dangling `author:` with nothing after it narrows nothing.
    if (term) clauses.push({ field, term });
  }

  let freeText = words.join(" ").trim();

  const identifier = detectIdentifier(freeText);
  if (identifier) {
    clauses.push(identifier);
    freeText = "";
  }

  return { clauses, freeText };
}

/** Writes a parsed search back out as a query string. */
export function serializeDiscoverSearch(parsed: ParsedDiscoverSearch): string {
  const parts = parsed.clauses.map(
    ({ field, term }) => `${field}:${quoteSearchValue(term)}`,
  );

  if (parsed.freeText) parts.push(parsed.freeText);

  return parts.join(" ");
}

/** The search with one clause removed, ready to put back in the search box. */
export function withoutDiscoverClause(
  parsed: ParsedDiscoverSearch,
  index: number,
): string {
  return serializeDiscoverSearch({
    ...parsed,
    clauses: parsed.clauses.filter((_, i) => i !== index),
  });
}

/** The search with the free text removed, keeping every clause. */
export function withoutDiscoverFreeText(parsed: ParsedDiscoverSearch): string {
  return serializeDiscoverSearch({ ...parsed, freeText: "" });
}

/**
 * Terms worth highlighting on a result card, which only shows the title,
 * description and keywords.
 */
export function discoverHighlightTerms(parsed: ParsedDiscoverSearch): {
  title: string[];
  description: string[];
  keyword: string[];
} {
  const pick = (field: DiscoverSearchField) => [
    ...(parsed.freeText ? [parsed.freeText] : []),
    ...parsed.clauses.filter((c) => c.field === field).map((c) => c.term),
  ];

  return {
    title: pick("title"),
    description: pick("description"),
    keyword: pick("keyword"),
  };
}
