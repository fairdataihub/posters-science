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
  const year = form.conferenceYear;
  if (!name) return false;
  if (year == null || year < CONFERENCE_YEAR_MIN || year > CONFERENCE_YEAR_MAX) {
    return false;
  }
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

  const payload: BulkImportConferenceMetadata = {
    conferenceName: form.conferenceName.trim(),
    conferenceYear: form.conferenceYear!,
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
}
