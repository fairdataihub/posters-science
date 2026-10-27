import { normalizeDoi } from "./doi.ts";

// Admin search is deliberately "all in one": a bare term looks at the poster id,
// title, owner and DOI at once.
export const POSTER_SEARCH_FIELDS = ["id", "title", "owner", "doi"] as const;

export type PosterSearchField = (typeof POSTER_SEARCH_FIELDS)[number];

export const POSTER_SEARCH_FIELD_LABELS: Record<PosterSearchField, string> = {
  id: "ID",
  title: "Title",
  owner: "Owner",
  doi: "DOI",
};

// Spellings an admin is likely to reach for, mapped to the canonical field.
const FIELD_ALIASES: Record<string, PosterSearchField> = {
  id: "id",
  poster: "id",
  title: "title",
  name: "title",
  owner: "owner",
  email: "owner",
  user: "owner",
  doi: "doi",
};

export type ParsedSearch = {
  /** null means every field. */
  field: PosterSearchField | null;
  term: string;
  /** True when the term was written as `field:value`. */
  scoped: boolean;
};

export const EMPTY_SEARCH: ParsedSearch = {
  field: null,
  term: "",
  scoped: false,
};

/**
 * Pulls an optional `field:value` prefix off the query. A prefix that is not a
 * known field is left alone, so pasting a DOI URL still searches for the URL
 * rather than being read as a `https:` scope.
 */
export function parsePosterSearch(
  raw: string | null | undefined,
): ParsedSearch {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return EMPTY_SEARCH;

  // DOIs are stored bare, so a pasted doi.org link is searched as its DOI.
  const match = trimmed.match(/^([a-zA-Z]+)\s*:\s*(.*)$/);
  if (!match) {
    return { field: null, term: normalizeDoi(trimmed), scoped: false };
  }

  const field = FIELD_ALIASES[match[1]!.toLowerCase()];
  if (!field) {
    return { field: null, term: normalizeDoi(trimmed), scoped: false };
  }

  const term = normalizeDoi(match[2]!);
  if (!term) return EMPTY_SEARCH;

  return { field, term, scoped: true };
}

/** The poster id a term refers to, or null when it is not a plain integer. */
export function searchTermAsPosterId(term: string): number | null {
  if (!/^\d+$/.test(term)) return null;

  const id = Number.parseInt(term, 10);

  return Number.isSafeInteger(id) ? id : null;
}

export type SearchablePoster = {
  id: number;
  title: string;
  user: { givenName: string; familyName: string; emailAddress: string };
  doi: string | null;
};

function includesInsensitive(
  haystack: string | null | undefined,
  term: string,
) {
  return (haystack ?? "").toLowerCase().includes(term.toLowerCase());
}

/** Words of a person's name as typed, e.g. "Doe, Jane" gives Doe and Jane. */
export function personNameWords(term: string): string[] {
  return term.split(/[\s,]+/).filter(Boolean);
}

type SearchableUser = {
  givenName: string;
  familyName: string;
  emailAddress: string;
};

/**
 * Mirrors the server's user search: the whole term in the email, first or last
 * name, or every word of a multi-word term in the first or last name.
 */
export function userMatchesSearch(user: SearchableUser, term: string): boolean {
  if (
    includesInsensitive(user.emailAddress, term) ||
    includesInsensitive(user.givenName, term) ||
    includesInsensitive(user.familyName, term)
  ) {
    return true;
  }

  const words = personNameWords(term);

  return (
    words.length > 1 &&
    words.every(
      (word) =>
        includesInsensitive(user.givenName, word) ||
        includesInsensitive(user.familyName, word),
    )
  );
}

/**
 * Which fields a row actually matched on, so the table can say why the row is
 * there.
 */
export function posterSearchMatches(
  poster: SearchablePoster,
  parsed: ParsedSearch,
): PosterSearchField[] {
  if (!parsed.term) return [];

  const wanted = parsed.field;
  const check = (field: PosterSearchField) => !wanted || wanted === field;
  const matches: PosterSearchField[] = [];

  if (check("id") && searchTermAsPosterId(parsed.term) === poster.id) {
    matches.push("id");
  }

  if (check("title") && includesInsensitive(poster.title, parsed.term)) {
    matches.push("title");
  }

  if (check("owner") && userMatchesSearch(poster.user, parsed.term)) {
    matches.push("owner");
  }

  if (check("doi") && includesInsensitive(poster.doi, parsed.term)) {
    matches.push("doi");
  }

  return matches;
}
