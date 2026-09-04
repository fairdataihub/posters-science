import type { ConferencePosting } from "./schema.js";

export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

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

export function normalizeConferenceTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractConferenceAcronym(title: string): string | undefined {
  const cleaned = title.replace(/^\d{4}\s+/, "").trim();
  const match = cleaned.match(/^([A-Z][A-Z0-9]{1,})(?:\b|[-_])/);

  if (!match) {
    return undefined;
  }

  const acronym = match[1].replace(/\d{4}$/, "").trim();

  return acronym.length >= 2 ? acronym : undefined;
}

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

export function countPopulatedFields(posting: ConferencePosting): number {
  const fields: Array<keyof ConferencePosting> = [
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

export function areSameConference(
  a: ConferencePosting,
  b: ConferencePosting,
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

export function findMatchingPosting(
  postings: ConferencePosting[],
  incoming: ConferencePosting,
): ConferencePosting | undefined {
  return postings.find((posting) => areSameConference(posting, incoming));
}

export function getMatchReason(
  a: ConferencePosting,
  b: ConferencePosting,
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

export function mergeConferencePostings(
  existing: ConferencePosting,
  incoming: ConferencePosting,
): ConferencePosting {
  const existingFields = countPopulatedFields(existing);
  const incomingFields = countPopulatedFields(incoming);

  const preferred = incomingFields > existingFields ? incoming : existing;

  const secondary = preferred === existing ? incoming : existing;

  const merged: ConferencePosting = {
    ...preferred,
  };

  for (const field of Object.keys(secondary) as Array<
    keyof ConferencePosting
  >) {
    const current = merged[field];
    const incomingValue = secondary[field];

    const currentEmpty =
      current === undefined || current === null || current === "";

    const incomingPopulated =
      incomingValue !== undefined &&
      incomingValue !== null &&
      incomingValue !== "";

    if (currentEmpty && incomingPopulated) {
      (merged as Record<string, unknown>)[field] = incomingValue;
    }
  }

  merged.id = preferred.id;

  return merged;
}
