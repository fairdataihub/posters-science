import type { CollectedConference } from "./schema.js";

/**
 * Introduces a random delay between min and max milliseconds.
 * Used for rate-limiting requests to external servers.
 */
export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Resolves a relative or absolute URL against a base URL.
 * Returns undefined if URL is invalid or empty.
 */
export function resolveUrl(
  url: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return undefined;
  }
}

/**
 * Formats a date as ISO 8601 string (YYYY-MM-DD).
 * Handles month names (e.g., "November", "Nov") and converts to numeric format.
 */
export function formatDateISO(
  month: string,
  day: string,
  year: number,
): string {
  const months: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    sept: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };

  const monthNumber = months[month.toLowerCase()] ?? "01";

  return `${year}-${monthNumber}-${day.padStart(2, "0")}`;
}

/**
 * Parses various date string formats (single date, date range, year-only).
 * Returns startDate, endDate (if available), and year.
 */
export function parseDateRange(dateStr: string): {
  startDate?: string;
  endDate?: string;
  year?: number;
} {
  if (!dateStr) {
    return {};
  }

  const years = dateStr.match(/\b(19\d{2}|20\d{2})\b/g);
  const year = years?.length
    ? Number.parseInt(years[years.length - 1], 10)
    : undefined;

  const rangeMatch = dateStr.match(
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})\s*-\s*(\w+)?\s*(\d{1,2}),?\s*(\d{4})?/,
  );

  if (rangeMatch) {
    const [, month1, day1, year1, month2, day2, year2] = rangeMatch;

    const startYear = Number.parseInt(year1, 10);
    const endYear = year2 ? Number.parseInt(year2, 10) : startYear;

    return {
      startDate: formatDateISO(month1, day1, startYear),
      ...(day2 && {
        endDate: formatDateISO(month2 || month1, day2, endYear),
      }),
      year,
    };
  }

  const singleMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);

  if (singleMatch) {
    const [, month, day, parsedYear] = singleMatch;

    return {
      startDate: formatDateISO(month, day, Number.parseInt(parsedYear, 10)),
      year: Number.parseInt(parsedYear, 10),
    };
  }

  return { year };
}

/**
 * Normalizes conference title for comparison:
 * removes years, converts to lowercase, and strips special characters.
 */
export function normalizeConferenceTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts acronym from conference title using pattern matching.
 * Returns undefined if no valid acronym found.
 */
export function extractConferenceAcronym(title: string): string | undefined {
  const cleaned = title.replace(/^\d{4}\s+/, "").trim();
  const match = cleaned.match(/^([A-Z][A-Z0-9]{1,})(?:\b|[-_])/);

  if (!match) {
    return undefined;
  }

  const acronym = match[1].replace(/\d{4}$/, "").trim();

  return acronym.length >= 2 ? acronym : undefined;
}

/**
 * Creates a unique deduplication key for a conference.
 * Prioritizes URI, then acronym+year, then normalized title+year.
 */
export function createDeduplicationKey(
  title: string,
  acronym: string | undefined,
  year: number,
  conferenceUri?: string,
): string {
  if (conferenceUri) {
    return `uri:${conferenceUri}`;
  }

  if (acronym) {
    return `acronym:${acronym.toLowerCase()}:${year}`;
  }

  return `title:${normalizeConferenceTitle(title)}:${year}`;
}

/**
 * Counts the number of populated (non-empty) fields in a conference posting.
 */
export function countPopulatedFields(posting: CollectedConference): number {
  const fields: Array<keyof CollectedConference> = [
    "conferenceName",
    "conferenceLocation",
    "conferenceUri",
    "conferenceIdentifier",
    "conferenceIdentifierType",
    "conferenceSchemaUri",
    "conferenceStartDate",
    "conferenceEndDate",
    "conferenceAcronym",
    "conferenceSeries",
    "conferenceYear",
  ];

  return fields.filter((field) => {
    const value = posting[field];

    return value !== undefined && value !== null && value !== "";
  }).length;
}

/**
 * Determines if two conferences refer to the same event.
 * Checks by URI, acronym+year, or normalized title+year.
 */
export function areSameConference(
  a: CollectedConference,
  b: CollectedConference,
): boolean {
  if (
    a.conferenceUri &&
    b.conferenceUri &&
    a.conferenceUri === b.conferenceUri
  ) {
    return true;
  }

  if (
    a.conferenceAcronym &&
    b.conferenceAcronym &&
    a.conferenceYear === b.conferenceYear &&
    a.conferenceAcronym.toLowerCase().trim() ===
      b.conferenceAcronym.toLowerCase().trim()
  ) {
    return true;
  }

  return (
    a.conferenceYear === b.conferenceYear &&
    normalizeConferenceTitle(a.conferenceName) ===
      normalizeConferenceTitle(b.conferenceName)
  );
}

/**
 * Finds a matching posting in a list using the same criteria as areSameConference.
 */
export function findMatchingPosting(
  postings: CollectedConference[],
  incoming: CollectedConference,
): CollectedConference | undefined {
  return postings.find((posting) => areSameConference(posting, incoming));
}

/**
 * Returns a human-readable reason why two conferences match.
 */
export function getMatchReason(
  a: CollectedConference,
  b: CollectedConference,
): string {
  if (
    a.conferenceUri &&
    b.conferenceUri &&
    a.conferenceUri === b.conferenceUri
  ) {
    return "same conference URI";
  }

  if (
    a.conferenceAcronym &&
    b.conferenceAcronym &&
    a.conferenceYear === b.conferenceYear &&
    a.conferenceAcronym.toLowerCase().trim() ===
      b.conferenceAcronym.toLowerCase().trim()
  ) {
    return `same acronym + year (${a.conferenceAcronym}:${a.conferenceYear})`;
  }

  if (
    a.conferenceYear === b.conferenceYear &&
    normalizeConferenceTitle(a.conferenceName) ===
      normalizeConferenceTitle(b.conferenceName)
  ) {
    return "same normalized title + year";
  }

  return "unknown";
}

/**
 * Merges two conference postings, preferring the one with more populated fields.
 * Falls back to existing record if field counts are equal.
 */
export function mergeConferencePostings(
  existing: CollectedConference,
  incoming: CollectedConference,
): CollectedConference {
  const existingFields = countPopulatedFields(existing);
  const incomingFields = countPopulatedFields(incoming);

  const preferred = incomingFields > existingFields ? incoming : existing;
  const secondary = preferred === existing ? incoming : existing;

  const result = { ...preferred };

  for (const field of Object.keys(secondary) as Array<
    keyof CollectedConference
  >) {
    const current = result[field];
    const incomingValue = secondary[field];

    const currentEmpty =
      current === undefined || current === null || current === "";

    const incomingPopulated =
      incomingValue !== undefined &&
      incomingValue !== null &&
      incomingValue !== "";

    if (currentEmpty && incomingPopulated) {
      // @ts-ignore
      (result as unknown as Record<string, unknown>)[field] = incomingValue;
    }
  }

  result.id = preferred.id;

  return result;
}
