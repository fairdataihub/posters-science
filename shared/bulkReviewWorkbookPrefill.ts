/** Workbook prefill helpers for bulk import batch-level values. */
import type { BulkImportConferenceMetadata } from "#shared/types/bulkImportConference";

/** Conference cells from the bulk wizard (override per-poster DB when generating the workbook). */
export function bulkReviewWorkbookConferenceCellsFromBatch(
  batch: BulkImportConferenceMetadata | undefined | null,
): Partial<Record<string, string | number>> {
  if (!batch?.conferenceName?.trim() || batch.conferenceYear == null) {
    return {};
  }

  const cells: Partial<Record<string, string | number>> = {
    conference_name: batch.conferenceName.trim(),
    conference_year: batch.conferenceYear,
  };

  const stringFields: {
    source: keyof BulkImportConferenceMetadata;
    fillKey: string;
  }[] = [
    { source: "conferenceLocation", fillKey: "conference_location" },
    { source: "conferenceAcronym", fillKey: "conference_acronym" },
    { source: "conferenceUri", fillKey: "conference_uri" },
    { source: "conferenceIdentifier", fillKey: "conference_identifier" },
    {
      source: "conferenceIdentifierType",
      fillKey: "conference_identifier_type",
    },
    { source: "conferenceSeries", fillKey: "conference_series" },
    { source: "conferenceStartDate", fillKey: "conference_start_date" },
    { source: "conferenceEndDate", fillKey: "conference_end_date" },
  ];

  for (const { source, fillKey } of stringFields) {
    if (!(source in batch)) continue;
    const value = batch[source];
    if (typeof value === "string" && value.trim()) {
      cells[fillKey] = value.trim();
    }
  }

  return cells;
}
