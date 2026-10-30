/**
 * Bulk metadata review workbook layout aligned with StrictFormSchema / poster.json
 * and the single-poster Review Metadata UI (share/[id]/index.vue).
 */

import { bulkReviewWorkbookInstructionForFillKey } from "#shared/bulkReviewWorkbookColumnInstructions";

export const BULK_REVIEW_WORKBOOK_HEADER_ROW = 1;
export const BULK_REVIEW_WORKBOOK_INSTRUCTION_ROW = 2;
export const BULK_REVIEW_WORKBOOK_REQUIREMENT_ROW = 3;
/** @deprecated Use BULK_REVIEW_WORKBOOK_REQUIREMENT_ROW */
export const BULK_REVIEW_WORKBOOK_TIER_ROW = BULK_REVIEW_WORKBOOK_REQUIREMENT_ROW;
export const BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW = 4;

/** Columns locked when the sheet is protected (empty = all data cells stay editable). */
export const BULK_REVIEW_WORKBOOK_LOCKED_FILL_KEYS = [] as const;

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
  /** Wrap cell text and grow row height (Excel character-width columns) */
  wrapText?: boolean;
  /** Short hint for the Instructions sheet */
  hint?: string;
  /** Row 2 help text (share UI + validation notes) */
  instruction?: string;
};

type ColOpts = { width?: number; wrapText?: boolean; hint?: string; instruction?: string };

function col(
  header: string,
  fillKey: string,
  schemaPath: string,
  tier: BulkReviewFieldTier,
  opts?: ColOpts,
): BulkReviewWorkbookColumn {
  return {
    header,
    fillKey,
    schemaPath,
    tier,
    ...opts,
    instruction:
      opts?.instruction ?? bulkReviewWorkbookInstructionForFillKey(fillKey),
  };
}

export type BulkReviewWorkbookSheet = {
  name: string;
  description: string;
  /** One row per poster vs repeating child rows */
  grain:
    | "poster"
    | "contributor"
    | "affiliation"
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

/** Canonical workbook tab names (Excel sheet names). */
export const BULK_REVIEW_WORKBOOK_SHEET_ABOUT = "About the Poster";
export const BULK_REVIEW_WORKBOOK_SHEET_CREATORS = "Creators";
export const BULK_REVIEW_WORKBOOK_SHEET_CONFERENCE = "Conference";
export const BULK_REVIEW_WORKBOOK_SHEET_ADDITIONAL = "Additional information";
export const BULK_REVIEW_WORKBOOK_SHEET_RELATED_RESOURCES = "Related resources";
export const BULK_REVIEW_WORKBOOK_SHEET_FUNDING = "Funding";
export const BULK_REVIEW_WORKBOOK_SHEET_POSTER_CONTENT = "Poster content";
export const BULK_REVIEW_WORKBOOK_SHEET_TABLE_CAPTIONS = "Table captions";
export const BULK_REVIEW_WORKBOOK_SHEET_IMAGE_CAPTIONS = "Image captions";

/** Older templates may use these tab titles; import still accepts them. */
export const BULK_REVIEW_WORKBOOK_SHEET_LEGACY_ALIASES: Record<string, string[]> =
  {
    [BULK_REVIEW_WORKBOOK_SHEET_ABOUT]: ["About the poster"],
    [BULK_REVIEW_WORKBOOK_SHEET_CREATORS]: ["Contributors"],
    [BULK_REVIEW_WORKBOOK_SHEET_ADDITIONAL]: ["Additional Information"],
  };

export function bulkReviewWorkbookResolveSheetName(
  canonicalName: string,
): string[] {
  return [
    canonicalName,
    ...(BULK_REVIEW_WORKBOOK_SHEET_LEGACY_ALIASES[canonicalName] ?? []),
  ];
}

/** Inline affiliation pairs on the Creators sheet (name + ROR per slot). */
export const BULK_REVIEW_CONTRIBUTOR_AFFILIATION_SLOT_COUNT = 30;

export function contributorAffiliationNameFillKey(slot: number): string {
  return `contributor_affiliation_${slot}_name`;
}

export function contributorAffiliationRorFillKey(slot: number): string {
  return `contributor_affiliation_${slot}_ror`;
}

function contributorAffiliationColumns(): BulkReviewWorkbookColumn[] {
  const columns: BulkReviewWorkbookColumn[] = [];
  for (
    let slot = 1;
    slot <= BULK_REVIEW_CONTRIBUTOR_AFFILIATION_SLOT_COUNT;
    slot++
  ) {
    columns.push(
      col(
        `Affiliation ${slot}`,
        contributorAffiliationNameFillKey(slot),
        `creators[].affiliation[${slot - 1}].name`,
        "optional",
        {
          width: 32,
          hint:
            slot === 1
              ? "Institution or organization; add Affiliation 2, 3, … on the same row as needed"
              : undefined,
        },
      ),
      col(
        `Affiliation ${slot} ROR identifier`,
        contributorAffiliationRorFillKey(slot),
        `creators[].affiliation[${slot - 1}].affiliationIdentifier`,
        "optional",
        { width: 28, hint: "ROR URL for this affiliation" },
      ),
    );
  }
  return columns;
}

export const BULK_REVIEW_WORKBOOK_SHEETS: BulkReviewWorkbookSheet[] = [
  {
    name: BULK_REVIEW_WORKBOOK_SHEET_ABOUT,
    description:
      "Mandatory — title, description, keywords (share UI: About the poster).",
    grain: "poster",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 42,
      }),
      col("Title", "title", "title", "minimal", {
        width: 80,
        wrapText: true,
      }),
      col("Description", "description", "description", "full", {
        width: 80,
        wrapText: true,
      }),
      col("Keywords", "keywords", "subjects", "full", {
        width: 48,
        hint: "Semicolon-separated keywords (maps to subjects[]).",
      }),
    ],
  },
  {
    name: BULK_REVIEW_WORKBOOK_SHEET_CREATORS,
    description:
      "Mandatory — one row per contributor per poster. ORCID (or org ROR for Organizational) plus up to 30 affiliations on the same row.",
    grain: "contributor",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("Given name", "given_name", "creators[].givenName", "near_exact", {
        width: 22,
      }),
      col("Family name", "family_name", "creators[].familyName", "near_exact", {
        width: 22,
      }),
      col("Name type", "name_type", "creators[].nameType", "minimal", {
        width: 16,
        hint: "Personal | Organizational",
      }),
      col(
        "ORCID identifier",
        "name_identifier",
        "creators[].nameIdentifiers[0].nameIdentifier",
        "optional",
        {
          width: 36,
          hint: "ORCID URL for Personal; organization ROR URL for Organizational",
        },
      ),
      ...contributorAffiliationColumns(),
    ],
  },
  {
    name: BULK_REVIEW_WORKBOOK_SHEET_CONFERENCE,
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
        {
          width: 14,
          hint: "Optional if start date is set (year is taken from start date on import)",
        },
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
        "Conference identifier",
        "conference_identifier",
        "conference.conferenceIdentifier",
        "optional",
        { width: 32 },
      ),
      col(
        "Conference identifier type",
        "conference_identifier_type",
        "conference.conferenceIdentifierType",
        "optional",
        { width: 22 },
      ),
      col(
        "Conference series",
        "conference_series",
        "conference.conferenceSeries",
        "optional",
        { width: 28 },
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
    name: BULK_REVIEW_WORKBOOK_SHEET_ADDITIONAL,
    description:
      "Optional — one row per poster: submission abstract, primary language, and domain (share UI: Poster Abstract + General).",
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
        { width: 55, wrapText: true },
      ),
      col("Primary language", "language", "language", "optional", {
        width: 12,
        hint: "ISO 639-1 code, e.g. en",
      }),
      col("Domain / field of study", "domain", "domain", "optional", {
        width: 28,
      }),
    ],
  },
  {
    name: BULK_REVIEW_WORKBOOK_SHEET_RELATED_RESOURCES,
    description:
      "Optional — one row per related resource (share UI: Related Resources). Row order is the list order. The Posters.science discover link is added automatically when you download the workbook.",
    grain: "relation",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 36,
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
    ],
  },
  {
    name: BULK_REVIEW_WORKBOOK_SHEET_FUNDING,
    description: "Optional — one row per funding reference (share UI: Funding).",
    grain: "funder",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 36,
      }),
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
    name: BULK_REVIEW_WORKBOOK_SHEET_POSTER_CONTENT,
    description:
      "Optional — poster body sections (share UI: Poster content). One row per section.",
    grain: "section",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 42,
      }),
      col(
        "Section title",
        "section_title",
        "posterContent.sections[].sectionTitle",
        "full",
        { width: 28 },
      ),
      col(
        "Section content",
        "section_content",
        "posterContent.sections[].sectionContent",
        "full",
        { width: 64, wrapText: true },
      ),
    ],
  },
  {
    name: BULK_REVIEW_WORKBOOK_SHEET_TABLE_CAPTIONS,
    description: "Optional — table captions extracted from the poster.",
    grain: "caption",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 42,
      }),
      col("Table ID", "item_id", "tableCaptions[].id", "optional", {
        width: 14,
      }),
      col("Caption", "caption", "tableCaptions[].caption", "near_exact", {
        width: 64,
        wrapText: true,
      }),
    ],
  },
  {
    name: BULK_REVIEW_WORKBOOK_SHEET_IMAGE_CAPTIONS,
    description: "Optional — figure/image captions extracted from the poster.",
    grain: "caption",
    columns: [
      col("Poster ID", "poster_id", "poster.id", "system", { width: 12 }),
      col("File name", "file_name", "extractionJob.fileName", "system", {
        width: 42,
      }),
      col("Figure ID", "item_id", "imageCaptions[].id", "optional", {
        width: 14,
      }),
      col("Caption", "caption", "imageCaptions[].caption", "minimal", {
        width: 64,
        wrapText: true,
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

function requirementRowValues(columns: BulkReviewWorkbookColumn[]): string[] {
  return columns.map((col) => bulkReviewWorkbookRequirementRowLabel(col.tier));
}

function rowHasRequirementLabels(
  sheet: { getRow: (n: number) => { getCell: (c: number) => { value: unknown } } },
  rowNumber: number,
  columnCount: number,
): boolean {
  for (let col = 1; col <= columnCount; col++) {
    const raw = sheet.getRow(rowNumber).getCell(col).value;
    const text =
      raw == null
        ? ""
        : typeof raw === "string"
          ? raw.trim()
          : String(raw).trim();
    if (text === "Required" || text === "Optional") return true;
  }
  return false;
}

/** New templates use row 4+; older templates used row 3 after a single Required/Optional row. */
export function bulkReviewWorkbookDetectFirstDataRow(
  sheet: { getRow: (n: number) => { getCell: (c: number) => { value: unknown } } },
  columnCount: number,
): number {
  if (rowHasRequirementLabels(sheet, BULK_REVIEW_WORKBOOK_REQUIREMENT_ROW, columnCount)) {
    return BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW;
  }
  if (rowHasRequirementLabels(sheet, 2, columnCount)) {
    return 3;
  }
  return BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW;
}

export { requirementRowValues as bulkReviewWorkbookRequirementRowValues };
