/**
 * Workbook prefill rules by bulk extraction level (Minimal vs Full).
 * Tweak policies here without changing server fill code.
 */
import type { BulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import type { BulkImportConferenceMetadata } from "#shared/types/bulkImportConference";
import type {
  BulkReviewFieldTier,
  BulkReviewWorkbookColumn,
} from "#shared/bulkReviewWorkbookManifest";
import { bulkReviewWorkbookColumnByFillKey } from "#shared/bulkReviewWorkbookManifest";

export type BulkReviewPosterContentKind = "section" | "figure" | "table";

export type BulkReviewWorkbookPrefillPolicy = {
  /** Extraction tiers whose values are copied from poster metadata into the workbook */
  extractedTiers: readonly BulkReviewFieldTier[];
  /** Emit related rows on Related resources and funding rows on Funding */
  includeLinksAndFunding: boolean;
  /** Which poster content kinds get rows (sections are lower-confidence body text) */
  posterContentKinds: readonly BulkReviewPosterContentKind[];
};

/** Prefill policy per extraction method — adjust tiers and flags to match product rules */
export const BULK_REVIEW_WORKBOOK_PREFILL_POLICIES: Record<
  BulkSubmissionExtractionMethod,
  BulkReviewWorkbookPrefillPolicy
> = {
  minimal: {
    extractedTiers: ["near_exact", "minimal"],
    includeLinksAndFunding: false,
    posterContentKinds: ["figure", "table"],
  },
  full: {
    extractedTiers: ["near_exact", "minimal", "high", "full", "optional"],
    includeLinksAndFunding: true,
    posterContentKinds: ["section", "figure", "table"],
  },
};

/**
 * Values applied at batch level (conference step, license, etc.), not gated by Minimal extraction.
 */
export const BULK_REVIEW_WORKBOOK_BATCH_FILL_KEYS = new Set<string>([
  "conference_name",
  "conference_year",
  "conference_location",
  "conference_acronym",
  "conference_uri",
  "conference_identifier",
  "conference_identifier_type",
  "conference_series",
  "conference_start_date",
  "conference_end_date",
  "presented_date",
  "license",
]);

/**
 * Poster content uses shared columns; effective tier depends on content kind (ROUGE-style).
 */
export function bulkReviewPosterContentColumnTier(
  fillKey: string,
  contentKind: BulkReviewPosterContentKind,
): BulkReviewFieldTier {
  if (
    fillKey === "section_title" ||
    fillKey === "title" ||
    fillKey === "item_id"
  ) {
    if (fillKey === "item_id") return "optional";
    return "full";
  }
  if (
    fillKey === "section_content" ||
    fillKey === "body" ||
    fillKey === "caption"
  ) {
    if (contentKind === "figure") return "minimal";
    if (contentKind === "table") return "near_exact";
    return "full";
  }
  return "system";
}

export function getBulkReviewWorkbookPrefillPolicy(
  extractionMethod: BulkSubmissionExtractionMethod,
): BulkReviewWorkbookPrefillPolicy {
  return BULK_REVIEW_WORKBOOK_PREFILL_POLICIES[extractionMethod];
}

export function bulkReviewWorkbookShouldPrefillColumn(
  extractionMethod: BulkSubmissionExtractionMethod,
  column: BulkReviewWorkbookColumn,
  context?: { contentKind?: BulkReviewPosterContentKind },
): boolean {
  if (column.tier === "system") return true;
  if (BULK_REVIEW_WORKBOOK_BATCH_FILL_KEYS.has(column.fillKey)) return true;

  const policy = getBulkReviewWorkbookPrefillPolicy(extractionMethod);

  if (context?.contentKind) {
    const effectiveTier = bulkReviewPosterContentColumnTier(
      column.fillKey,
      context.contentKind,
    );
    if (effectiveTier === "system") return true;
    return policy.extractedTiers.includes(effectiveTier);
  }

  return policy.extractedTiers.includes(column.tier);
}

/** Drop cell values that this extraction level should not prefill (columns remain in the sheet). */
export function applyBulkReviewWorkbookPrefillPolicy(
  extractionMethod: BulkSubmissionExtractionMethod,
  columns: BulkReviewWorkbookColumn[],
  values: Record<string, string | number>,
  context?: { contentKind?: BulkReviewPosterContentKind },
): Record<string, string | number> {
  const filtered: Record<string, string | number> = {};
  for (const column of columns) {
    if (!(column.fillKey in values)) continue;
    if (
      bulkReviewWorkbookShouldPrefillColumn(extractionMethod, column, context)
    ) {
      filtered[column.fillKey] = values[column.fillKey];
    }
  }
  return filtered;
}

export function bulkReviewWorkbookPrefillSummary(
  extractionMethod: BulkSubmissionExtractionMethod,
): string {
  if (extractionMethod === "minimal") {
    return (
      "This batch uses Minimal extraction. Prefilled cells include identifiers, batch " +
      "conference/license fields, and high-confidence extraction (near exact + minimal tiers: " +
      "title, author names, figure/table captions). Other columns are left blank."
    );
  }
  return (
    "This batch uses Full extraction. Prefilled cells include all extracted metadata " +
    "(sections, keywords, links, funding, optional identifiers, and lower-confidence fields). " +
    "Review quality flags in the app."
  );
}

/** Whether extracted (non-batch) metadata for a manifest field should remain stored / shown. */
export function bulkReviewShouldPersistExtractedField(
  extractionMethod: BulkSubmissionExtractionMethod,
  fillKey: string,
  context?: { contentKind?: BulkReviewPosterContentKind },
): boolean {
  if (BULK_REVIEW_WORKBOOK_BATCH_FILL_KEYS.has(fillKey)) return true;

  if (context?.contentKind) {
    if (
      fillKey === "body" ||
      fillKey === "title" ||
      fillKey === "section_title" ||
      fillKey === "section_content" ||
      fillKey === "caption" ||
      fillKey === "item_id"
    ) {
      const effectiveTier = bulkReviewPosterContentColumnTier(
        fillKey,
        context.contentKind,
      );
      if (effectiveTier === "system") return true;
      return getBulkReviewWorkbookPrefillPolicy(
        extractionMethod,
      ).extractedTiers.includes(effectiveTier);
    }
  }

  const column = bulkReviewWorkbookColumnByFillKey(fillKey);
  if (!column) {
    return extractionMethod === "full";
  }

  return bulkReviewWorkbookShouldPrefillColumn(extractionMethod, column, context);
}

export function bulkReviewShouldPersistPosterCaption(
  extractionMethod: BulkSubmissionExtractionMethod,
  contentKind: Exclude<BulkReviewPosterContentKind, "section">,
): boolean {
  const policy = getBulkReviewWorkbookPrefillPolicy(extractionMethod);
  if (!policy.posterContentKinds.includes(contentKind)) return false;
  return bulkReviewShouldPersistExtractedField(extractionMethod, "caption", {
    contentKind,
  });
}

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
