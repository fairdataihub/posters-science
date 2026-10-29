/**
 * Bulk metadata review workbook layout aligned with StrictFormSchema / poster.json
 * and the single-poster Review Metadata UI (share/[id]/index.vue).
 */

export const BULK_REVIEW_WORKBOOK_HEADER_ROW = 1;
export const BULK_REVIEW_WORKBOOK_TIER_ROW = 2;
export const BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW = 3;

/** Filled by Posters.science; lock these columns in the workbook (not user-editable). */
export const BULK_REVIEW_WORKBOOK_LOCKED_FILL_KEYS = [
  "poster_id",
  "file_name",
] as const;

/** @deprecated Use BULK_REVIEW_WORKBOOK_LOCKED_FILL_KEYS */
export const BULK_REVIEW_WORKBOOK_LOCKED_COLUMN_HEADERS =
  BULK_REVIEW_WORKBOOK_LOCKED_FILL_KEYS;

export const BULK_IMPORT_METADATA_REVIEW_TEMPLATE_RELATIVE_PATH =
  "public/bulk-submission-templates/metadata-review.xlsx";

export type BulkReviewFieldTier =
  | "system"
  | "near_exact"
  | "minimal"
  | "high"
  | "full"
  | "optional";

export type BulkReviewWorkbookColumn = {
  /** Human-readable column title in row 1 */
  header: string;
  /** Stable key used when reading/writing cell values */
  fillKey: string;
  /** Dot path into poster metadata / form state (documentation) */
  schemaPath: string;
  tier: BulkReviewFieldTier;
  width?: number;
  /** Short hint for the Instructions sheet */
  hint?: string;
};

type ColOpts = { width?: number; hint?: string };

function col(
  header: string,
  fillKey: string,
  schemaPath: string,
  tier: BulkReviewFieldTier,
  opts?: ColOpts,
): BulkReviewWorkbookColumn {
  return { header, fillKey, schemaPath, tier, ...opts };
}

export type BulkReviewWorkbookSheet = {
  name: string;
  description: string;
  /** One row per poster vs repeating child rows */
  grain:
    | "poster"
    | "creator"
    | "relation"
    | "funder"
    | "section"
    | "caption"
    | "links"
    | "content";
  columns: BulkReviewWorkbookColumn[];
};

/** Row 2 label and header fill: required vs optional (extraction tier is internal only). */
export type BulkReviewColumnRequirement = "required" | "optional";

export function bulkReviewColumnRequirement(
  tier: BulkReviewFieldTier,
): BulkReviewColumnRequirement {
  return tier === "optional" ? "optional" : "required";
}

export const BULK_REVIEW_REQUIREMENT_ROW_LABEL: Record<
  BulkReviewColumnRequirement,
  string
> = {
  required: "Required",
  optional: "Optional",
};

/** Excel ARGB fills for column headers (row 1–2). */
export const BULK_REVIEW_WORKBOOK_COLUMN_FILL: Record<
  BulkReviewFieldTier,
  string
> = {
  system: "FFE7E6E6",
  near_exact: "FFB4C7E7",
  minimal: "FFB4C7E7",
  high: "FFB4C7E7",
  full: "FFB4C7E7",
  optional: "FFF2F2F2",
};

export function bulkReviewWorkbookRequirementRowLabel(
  tier: BulkReviewFieldTier,
): string {
  return BULK_REVIEW_REQUIREMENT_ROW_LABEL[bulkReviewColumnRequirement(tier)];
}

export function bulkReviewWorkbookColumnFillArgb(
  tier: BulkReviewFieldTier,
): string {
  return BULK_REVIEW_WORKBOOK_COLUMN_FILL[tier];
}

export const BULK_REVIEW_WORKBOOK_SHEETS: BulkReviewWorkbookSheet[] = [
  {
    name: "About the poster",
    description: "Mandatory — title, description, keywords (share UI: About the poster).",
    grain: "poster",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 42,
      }),
      col("Title", "title", "title", "minimal", { width: 52 }),
      col("Description", "description", "description", "full", { width: 55 }),
      col("Keywords", "keywords", "subjects", "full", {
        width: 48,
        hint: "Semicolon-separated keywords (maps to subjects[]).",
      }),
    ],
  },
  {
    name: "Creators",
    description:
      "Mandatory — one row per creator affiliation (creator fields repeat when an author has multiple affiliations).",
    grain: "creator",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 28,
      }),
      col("Creator order", "creator_order", "creators[].order", "system", {
        width: 14,
        hint: "1-based order matching the web UI.",
      }),
      col("Name type", "name_type", "creators[].nameType", "minimal", {
        width: 16,
        hint: "Personal | Organizational",
      }),
      col("Given name", "given_name", "creators[].givenName", "near_exact", {
        width: 22,
      }),
      col("Family name", "family_name", "creators[].familyName", "near_exact", {
        width: 22,
      }),
      col(
        "Name identifier",
        "name_identifier",
        "creators[].nameIdentifiers[0].nameIdentifier",
        "optional",
        { width: 36, hint: "ORCID or organization ROR URL" },
      ),
      col(
        "Name identifier scheme",
        "name_identifier_scheme",
        "creators[].nameIdentifiers[0].nameIdentifierScheme",
        "optional",
        { width: 22 },
      ),
      col(
        "Affiliation order",
        "affiliation_order",
        "creators[].affiliation[].order",
        "system",
        { width: 16, hint: "Leave blank if the creator has no affiliation on this row." },
      ),
      col(
        "Affiliation name",
        "affiliation_name",
        "creators[].affiliation[].name",
        "minimal",
        { width: 40 },
      ),
      col(
        "Affiliation identifier",
        "affiliation_identifier",
        "creators[].affiliation[].affiliationIdentifier",
        "minimal",
        { width: 36, hint: "ROR URL" },
      ),
    ],
  },
  {
    name: "Conference",
    description: "Mandatory — conference or event (share UI: Conference).",
    grain: "poster",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 36,
      }),
      col(
        "Conference name",
        "conference_name",
        "conference.conferenceName",
        "optional",
        { width: 40 },
      ),
      col(
        "Conference year",
        "conference_year",
        "conference.conferenceYear",
        "optional",
        { width: 14 },
      ),
      col(
        "Conference location",
        "conference_location",
        "conference.conferenceLocation",
        "optional",
        { width: 28 },
      ),
      col(
        "Conference acronym",
        "conference_acronym",
        "conference.conferenceAcronym",
        "optional",
        { width: 14 },
      ),
      col(
        "Conference website",
        "conference_uri",
        "conference.conferenceUri",
        "optional",
        { width: 36 },
      ),
      col(
        "Conference start date",
        "conference_start_date",
        "conference.conferenceStartDate",
        "optional",
        { width: 18, hint: "ISO date YYYY-MM-DD" },
      ),
      col(
        "Conference end date",
        "conference_end_date",
        "conference.conferenceEndDate",
        "optional",
        { width: 18 },
      ),
      col(
        "Poster presentation date",
        "presented_date",
        "conference.presentedStartDate",
        "optional",
        { width: 18 },
      ),
    ],
  },
  {
    name: "Additional Information",
    description:
      "Optional — abstract, language, domain, license, and publication fields (share UI: Additional Information).",
    grain: "poster",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 36,
      }),
      col(
        "Submission abstract",
        "submission_abstract",
        "submissionAbstract",
        "optional",
        { width: 55 },
      ),
      col("Primary language", "language", "language", "optional", {
        width: 12,
        hint: "ISO 639-1 code, e.g. en",
      }),
      col("Domain / field of study", "domain", "domain", "optional", {
        width: 28,
      }),
      col("License", "license", "license", "optional", {
        width: 16,
        hint: "SPDX id, e.g. CC-BY-4.0 (often set at batch level)",
      }),
      col("Version", "version", "version", "optional", { width: 10 }),
      col("DOI", "doi", "doi", "optional", {
        width: 28,
        hint: "Usually filled after Zenodo publish",
      }),
      col("Publisher", "publisher", "publisher", "optional", { width: 24 }),
      col(
        "Publication year",
        "publication_year",
        "publicationYear",
        "optional",
        { width: 16 },
      ),
    ],
  },
  {
    name: "Links & funding",
    description:
      "Optional — related resources and funding (share UI: Related Resources + Funding). Use Kind = related | funding.",
    grain: "links",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 42,
        hint: "Poster PDF filename — do not edit.",
      }),
      col("Kind", "kind", "bulk.links.kind", "system", {
        width: 12,
        hint: "related | funding",
      }),
      col("Entry order", "entry_order", "bulk.links.order", "system", {
        width: 12,
      }),
      col(
        "Related identifier",
        "related_identifier",
        "relatedIdentifiers[].relatedIdentifier",
        "optional",
        { width: 36 },
      ),
      col(
        "Related identifier type",
        "related_identifier_type",
        "relatedIdentifiers[].relatedIdentifierType",
        "optional",
        { width: 22 },
      ),
      col(
        "Relation type",
        "relation_type",
        "relatedIdentifiers[].relationType",
        "optional",
        { width: 22 },
      ),
      col(
        "Relation description",
        "relation_description",
        "relatedIdentifiers[].relationTypeInformation",
        "optional",
        { width: 32 },
      ),
      col(
        "Resource type",
        "resource_type_general",
        "relatedIdentifiers[].resourceTypeGeneral",
        "optional",
        { width: 22 },
      ),
      col(
        "Funder name",
        "funder_name",
        "fundingReferences[].funderName",
        "optional",
        { width: 32 },
      ),
      col(
        "Funder identifier type",
        "funder_identifier_type",
        "fundingReferences[].funderIdentifierType",
        "optional",
        { width: 22 },
      ),
      col(
        "Funder identifier",
        "funder_identifier",
        "fundingReferences[].funderIdentifier",
        "optional",
        { width: 36 },
      ),
      col("Scheme URI", "scheme_uri", "fundingReferences[].schemeUri", "optional", {
        width: 28,
      }),
      col(
        "Award number",
        "award_number",
        "fundingReferences[].awardNumber",
        "optional",
        { width: 18 },
      ),
      col(
        "Award title",
        "award_title",
        "fundingReferences[].awardTitle",
        "optional",
        { width: 28 },
      ),
      col("Award URI", "award_uri", "fundingReferences[].awardUri", "optional", {
        width: 32,
      }),
    ],
  },
  {
    name: "Poster content",
    description:
      "Auto-extracted poster text and captions (share UI: Poster Content). One row per section or caption.",
    grain: "content",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 42,
        hint: "Poster PDF filename — do not edit.",
      }),
      col(
        "Section title",
        "title",
        "posterContent.sections[].sectionTitle",
        "full",
        { width: 28, hint: "Section heading (leave blank for figure/table captions)" },
      ),
      col("Body", "body", "bulk.content.body", "full", {
        width: 64,
        hint: "Section text or figure/table caption",
      }),
    ],
  },
];

const columnsByFillKey = new Map<string, BulkReviewWorkbookColumn>();
for (const sheet of BULK_REVIEW_WORKBOOK_SHEETS) {
  for (const column of sheet.columns) {
    if (!columnsByFillKey.has(column.fillKey)) {
      columnsByFillKey.set(column.fillKey, column);
    }
  }
}

export function bulkReviewWorkbookColumnByFillKey(
  fillKey: string,
): BulkReviewWorkbookColumn | undefined {
  return columnsByFillKey.get(fillKey);
}
