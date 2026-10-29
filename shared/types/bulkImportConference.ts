export type BulkImportConferenceAttendance = "In-person" | "Online";

/** Matches bulk import validation (stricter than poster.json 1000–9999). */
export const CONFERENCE_YEAR_MIN = 1900;
export const CONFERENCE_YEAR_MAX = 2100;

/** Latest year shown in conference year dropdowns (today + this many years). */
export const CONFERENCE_YEAR_SELECT_YEARS_AHEAD = 2;

export function conferenceYearSelectOptions(referenceDate = new Date()) {
  const currentYear = referenceDate.getFullYear();
  const maxYear = currentYear + CONFERENCE_YEAR_SELECT_YEARS_AHEAD;
  return Array.from(
    { length: maxYear - CONFERENCE_YEAR_MIN + 1 },
    (_, index) => maxYear - index,
  ).map((year) => ({ label: String(year), value: year }));
}

/** Parse conference year from a W3C date string (YYYY or YYYY-MM-DD). */
export function conferenceYearFromStartDate(
  startDate: string | undefined | null,
): number | undefined {
  const trimmed = startDate?.trim();
  if (!trimmed) return undefined;

  const match = trimmed.match(/^(\d{4})(?:-\d{2}-\d{2})?/);
  if (!match) return undefined;

  const year = Number.parseInt(match[1]!, 10);
  if (year < CONFERENCE_YEAR_MIN || year > CONFERENCE_YEAR_MAX) {
    return undefined;
  }

  return year;
}

export function syncConferenceYearFromStartDate(
  form: Pick<BulkImportConferenceFormState, "conferenceStartDate" | "conferenceYear">,
) {
  form.conferenceYear = conferenceYearFromStartDate(form.conferenceStartDate);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a calendar date in YYYY-MM-DD (UTC midnight). */
export function parseConferenceIsoDate(
  value: string | undefined | null,
): Date | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const match = trimmed.match(ISO_DATE);
  if (!match) return undefined;

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return date;
}

const MS_PER_DAY = 86_400_000;
/** Longest span allowed between conference start and end (inclusive of both days). */
export const CONFERENCE_DATE_RANGE_MAX_DAYS = 365;

export function validateConferenceDateRange(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
): { valid: true } | { valid: false; message: string } {
  const start = parseConferenceIsoDate(startDate);
  if (!start) {
    return {
      valid: false,
      message: "Enter a valid start date (YYYY-MM-DD)",
    };
  }

  const endTrimmed = endDate?.trim();
  if (!endTrimmed) {
    return { valid: true };
  }

  const end = parseConferenceIsoDate(endTrimmed);
  if (!end) {
    return {
      valid: false,
      message: "Enter a valid end date (YYYY-MM-DD)",
    };
  }

  if (start.getTime() > end.getTime()) {
    return {
      valid: false,
      message: "Start date must be on or before the end date",
    };
  }

  const spanDays = (end.getTime() - start.getTime()) / MS_PER_DAY;
  if (spanDays > CONFERENCE_DATE_RANGE_MAX_DAYS) {
    return {
      valid: false,
      message:
        "Start and end dates must be within one year of each other (365 days or less)",
    };
  }

  return { valid: true };
}

/** Map range validation to form field errors (start vs end). */
export function conferenceDateRangeFieldErrors(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
  options?: { requireEnd?: boolean },
): { start?: string; end?: string } {
  const start = startDate?.trim() ?? "";
  if (!start || conferenceYearFromStartDate(start) == null) {
    return {
      start:
        "Conference start date is required (year is taken from this date)",
    };
  }

  const end = endDate?.trim() ?? "";
  if (options?.requireEnd && !end) {
    return { end: "Conference end date is required" };
  }

  const range = validateConferenceDateRange(startDate, endDate);
  if (range.valid) return {};

  if (range.message.includes("valid start")) {
    return { start: range.message };
  }
  if (range.message.includes("Start date must be")) {
    return { start: range.message, end: range.message };
  }

  return { end: range.message };
}

export const BULK_IMPORT_CONFERENCE_ATTENDANCE_OPTIONS: {
  label: string;
  value: BulkImportConferenceAttendance;
}[] = [
  { label: "In-person", value: "In-person" },
  { label: "Online", value: "Online" },
];

const ONLINE_CONFERENCE_LOCATION = "Online";

function isOnlineConferenceLocation(value: string | undefined | null): boolean {
  return value?.trim().toLowerCase() === ONLINE_CONFERENCE_LOCATION.toLowerCase();
}

/** Poster `conference` object for bulk import (poster schema v0.2). */
export type BulkImportConferenceMetadata = {
  conferenceName: string;
  conferenceYear: number;
  conferenceLocation?: string;
  conferenceUri?: string;
  conferenceIdentifier?: string;
  conferenceIdentifierType?: string;
  conferenceSchemaUri?: string;
  conferenceStartDate?: string;
  conferenceEndDate?: string;
  conferenceAcronym?: string;
  conferenceSeries?: string;
};

export type BulkImportConferenceFormState = {
  conferenceName: string;
  conferenceYear: number | undefined;
  conferenceAttendance: BulkImportConferenceAttendance | undefined;
  conferenceLocation: string;
  conferenceUri: string;
  conferenceIdentifier: string;
  conferenceIdentifierType: string;
  conferenceSchemaUri: string;
  conferenceStartDate: string;
  conferenceEndDate: string;
  conferenceAcronym: string;
  conferenceSeries: string;
};

export function emptyBulkImportConferenceForm(): BulkImportConferenceFormState {
  return {
    conferenceName: "",
    conferenceYear: undefined,
    conferenceAttendance: undefined,
    conferenceLocation: "",
    conferenceUri: "",
    conferenceIdentifier: "",
    conferenceIdentifierType: "",
    conferenceSchemaUri: "",
    conferenceStartDate: "",
    conferenceEndDate: "",
    conferenceAcronym: "",
    conferenceSeries: "",
  };
}

export function bulkImportConferenceFormValid(
  form: BulkImportConferenceFormState,
): boolean {
  const name = form.conferenceName.trim();
  if (!name) return false;

  const start = form.conferenceStartDate.trim();
  if (!start) return false;

  const year = conferenceYearFromStartDate(start);
  if (year == null) return false;

  const range = validateConferenceDateRange(
    form.conferenceStartDate,
    form.conferenceEndDate,
  );
  if (!range.valid) return false;

  if (form.conferenceIdentifier.trim() && !form.conferenceIdentifierType.trim()) {
    return false;
  }
  if (!form.conferenceAttendance) return false;
  if (
    form.conferenceAttendance === "In-person" &&
    !form.conferenceLocation.trim()
  ) {
    return false;
  }
  return true;
}

export function bulkImportConferenceFromForm(
  form: BulkImportConferenceFormState,
): BulkImportConferenceMetadata | null {
  if (!bulkImportConferenceFormValid(form)) return null;

  const year = conferenceYearFromStartDate(form.conferenceStartDate)!;

  const payload: BulkImportConferenceMetadata = {
    conferenceName: form.conferenceName.trim(),
    conferenceYear: year,
  };

  if (form.conferenceAttendance === "Online") {
    payload.conferenceLocation = ONLINE_CONFERENCE_LOCATION;
  } else if (form.conferenceLocation.trim()) {
    payload.conferenceLocation = form.conferenceLocation.trim();
  }

  const optionalStringFields: (keyof BulkImportConferenceFormState)[] = [
    "conferenceUri",
    "conferenceIdentifier",
    "conferenceIdentifierType",
    "conferenceSchemaUri",
    "conferenceStartDate",
    "conferenceEndDate",
    "conferenceAcronym",
    "conferenceSeries",
  ];

  for (const key of optionalStringFields) {
    const value = form[key].trim();
    if (value) {
      (payload as Record<string, string | number>)[key] = value;
    }
  }

  return payload;
}

export function applyBulkImportConferenceToForm(
  form: BulkImportConferenceFormState,
  metadata: BulkImportConferenceMetadata | undefined | null,
) {
  if (!metadata) return;

  form.conferenceName = metadata.conferenceName ?? "";
  form.conferenceYear = metadata.conferenceYear;
  const location = metadata.conferenceLocation ?? "";
  if (isOnlineConferenceLocation(location)) {
    form.conferenceAttendance = "Online";
    form.conferenceLocation = "";
  } else if (location.trim()) {
    form.conferenceAttendance = "In-person";
    form.conferenceLocation = location;
  } else {
    form.conferenceAttendance = undefined;
    form.conferenceLocation = "";
  }
  form.conferenceUri = metadata.conferenceUri ?? "";
  form.conferenceIdentifier = metadata.conferenceIdentifier ?? "";
  form.conferenceIdentifierType = metadata.conferenceIdentifierType ?? "";
  form.conferenceSchemaUri = metadata.conferenceSchemaUri ?? "";
  form.conferenceStartDate = metadata.conferenceStartDate ?? "";
  form.conferenceEndDate = metadata.conferenceEndDate ?? "";
  form.conferenceAcronym = metadata.conferenceAcronym ?? "";
  form.conferenceSeries = metadata.conferenceSeries ?? "";
  syncConferenceYearFromStartDate(form);
}
