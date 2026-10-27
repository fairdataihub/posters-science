// Search grammar shared by the admin and discover search boxes. Each page owns
// its own field list; this file only knows how to split a query into
// `field:value` tokens and how to highlight what matched.

// A literal double quote. Built from its char code because prettier and the
// quotes lint rule disagree on how to spell it as a string literal.
const QUOTE = String.fromCharCode(34);

export type SearchToken = {
  /** Lowercased prefix, or null for a plain word or quoted phrase. */
  key: string | null;
  value: string;
};

/**
 * Splits a query into `key:value`, `key:"quoted value"`, plain words and
 * `"quoted phrases"`. A prefix only counts when `isKey` recognises it, so
 * pasting a URL such as `https://doi.org/10.1/x` stays one literal word rather
 * than being read as an `https:` scope.
 */
export function tokenizeSearch(
  raw: string | null | undefined,
  isKey: (key: string) => boolean,
): SearchToken[] {
  const input = raw ?? "";
  const tokens: SearchToken[] = [];

  let cursor = 0;

  const skipSpace = () => {
    while (cursor < input.length && /\s/.test(input[cursor]!)) cursor++;
  };

  // Reads a quoted phrase or a run of non-space characters.
  const readValue = (): string => {
    if (input[cursor] === QUOTE) {
      const close = input.indexOf(QUOTE, cursor + 1);
      const end = close === -1 ? input.length : close;
      const value = input.slice(cursor + 1, end);
      cursor = close === -1 ? input.length : close + 1;

      return value.trim();
    }

    const start = cursor;
    while (cursor < input.length && !/\s/.test(input[cursor]!)) cursor++;

    return input.slice(start, cursor);
  };

  while (true) {
    skipSpace();
    if (cursor >= input.length) break;

    const prefix = input.slice(cursor).match(/^([a-zA-Z]+)\s*:/);
    const key = prefix?.[1]?.toLowerCase();

    if (prefix && key && isKey(key)) {
      cursor += prefix[0].length;

      // Allow `author: smith` as well as `author:smith`.
      skipSpace();

      const value = cursor < input.length ? readValue() : "";
      tokens.push({ key, value });
      continue;
    }

    const value = readValue();
    if (value) tokens.push({ key: null, value });
  }

  return tokens;
}

/**
 * Escapes LIKE wildcards so a term is matched literally. Prisma's `contains`,
 * `startsWith` and `endsWith` hand the term to LIKE unescaped, so without this
 * `_` matches any character and `%` matches anything.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Writes a value back out, quoting it when it would not survive as one word. */
export function quoteSearchValue(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, "")}"` : value;
}

export type HighlightSegment = { text: string; match: boolean };

/**
 * Splits text into alternating plain and matching segments for rendering. Falls
 * back to a single plain segment when there is nothing to highlight. Several
 * terms may be given; where two overlap at the same spot the longer one wins.
 */
export function splitHighlight(
  text: string | null | undefined,
  term: string | readonly string[] | null | undefined,
): HighlightSegment[] {
  const value = text ?? "";
  const needles = (Array.isArray(term) ? term : [term])
    .map((t) => (t ?? "").trim().toLowerCase())
    .filter(Boolean);

  if (!value || needles.length === 0) return [{ text: value, match: false }];

  const haystack = value.toLowerCase();
  const segments: HighlightSegment[] = [];

  let cursor = 0;

  while (cursor < value.length) {
    let found = -1;
    let length = 0;

    for (const needle of needles) {
      const at = haystack.indexOf(needle, cursor);
      if (at === -1) continue;

      if (
        found === -1 ||
        at < found ||
        (at === found && needle.length > length)
      ) {
        found = at;
        length = needle.length;
      }
    }

    if (found === -1) {
      segments.push({ text: value.slice(cursor), match: false });
      break;
    }

    if (found > cursor) {
      segments.push({ text: value.slice(cursor, found), match: false });
    }

    segments.push({ text: value.slice(found, found + length), match: true });
    cursor = found + length;
  }

  return segments.length > 0 ? segments : [{ text: value, match: false }];
}
