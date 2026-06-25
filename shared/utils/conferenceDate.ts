import dayjs from "dayjs";

// Conference dates arrive in many shapes:
// ("2011-01-01"), ("16th March, 2011", "May 24, 2014"),
// ("November 3-7, 2019", "22-23/2/2007"),
// ("January") and ("Not specified").
// These helpers normalize only the unambiguous formats

const CONFERENCE_DATE_PLACEHOLDERS = new Set([
  "not specified",
  "not available",
  "n/a",
  "na",
  "none",
  "null",
  "unknown",
  "tbd",
  "tba",
  "-",
  "--",
]);

// A fully specified ISO date (YYYY-MM-DD) as a valid dayjs instance, else null.
const isoFullDate = (raw?: string | null) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = dayjs(trimmed);

  return d.isValid() ? d : null;
};

// Normalize a single conference date string for display. Returns null for empty
// values and known non-date placeholders (e.g. "Not specified").
export const cleanConferenceDate = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || CONFERENCE_DATE_PLACEHOLDERS.has(trimmed.toLowerCase())) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return dayjs(trimmed).format("MMM D, YYYY");
  }
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return dayjs(`${trimmed}-01`).format("MMM YYYY");
  }

  return trimmed;
};

// Combine start/end conference dates into a single string.
// Returns "" when neither value resolves to a usable date.
export const formatConferenceDateRange = (
  start?: string | null,
  end?: string | null,
): string => {
  // Collapse two full ISO dates into a range (e.g. "Nov 3 - Nov 7, 2019").
  const isoStart = isoFullDate(start);
  const isoEnd = isoFullDate(end);
  if (isoStart && isoEnd) {
    if (isoStart.isSame(isoEnd, "day")) return isoStart.format("MMM D, YYYY");
    if (isoStart.isSame(isoEnd, "year")) {
      return `${isoStart.format("MMM D")} - ${isoEnd.format("MMM D, YYYY")}`;
    }

    return `${isoStart.format("MMM D, YYYY")} - ${isoEnd.format("MMM D, YYYY")}`;
  }

  const cleanStart = cleanConferenceDate(start);
  const cleanEnd = cleanConferenceDate(end);
  if (cleanStart && cleanEnd) {
    if (cleanStart === cleanEnd) return cleanStart;
    // A single field may already hold the whole range (e.g. start holds
    // "November 3-7, 2019"); avoid repeating it.
    if (cleanStart.includes(cleanEnd)) return cleanStart;
    if (cleanEnd.includes(cleanStart)) return cleanEnd;

    return `${cleanStart} - ${cleanEnd}`;
  }

  return cleanStart ?? cleanEnd ?? "";
};
