import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  Poster,
  PosterMetadata,
  ExtractionJob,
} from "#shared/generated/client";
import ExcelJS from "exceljs";
import {
  BULK_IMPORT_METADATA_REVIEW_TEMPLATE_RELATIVE_PATH,
  BULK_REVIEW_CONTRIBUTOR_AFFILIATION_SLOT_COUNT,
  BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW,
  BULK_REVIEW_WORKBOOK_SHEETS,
  BULK_REVIEW_WORKBOOK_SHEET_ABOUT,
  BULK_REVIEW_WORKBOOK_SHEET_ADDITIONAL,
  BULK_REVIEW_WORKBOOK_SHEET_IDENTIFIERS,
  BULK_REVIEW_WORKBOOK_SHEET_RELATED_RESOURCES,
  BULK_REVIEW_WORKBOOK_SHEET_CONFERENCE,
  BULK_REVIEW_WORKBOOK_SHEET_CREATORS,
  BULK_REVIEW_WORKBOOK_SHEET_FUNDING,
  BULK_REVIEW_WORKBOOK_SHEET_IMAGE_CAPTIONS,
  BULK_REVIEW_WORKBOOK_SHEET_POSTER_CONTENT,
  BULK_REVIEW_WORKBOOK_SHEET_TABLE_CAPTIONS,
  contributorAffiliationNameFillKey,
  contributorAffiliationRorFillKey,
  type BulkReviewWorkbookColumn,
} from "#shared/bulkReviewWorkbookManifest";
import { bulkReviewWorkbookConferenceCellsFromBatch } from "#shared/bulkReviewWorkbookPrefill";
import type { BulkImportConferenceMetadata } from "#shared/types/bulkImportConference";
import { applyBulkReviewWorkbookSheetProtection } from "~~/server/utils/bulkReviewWorkbookSheetProtection";
import {
  applyBulkReviewWorkbookColumnWidths,
  applyBulkReviewWorkbookDataRowLayout,
  applyBulkReviewWorkbookMetaRows,
} from "~~/server/utils/bulkReviewWorkbookColumnLayout";

type PosterRow = Poster & {
  posterMetadata: PosterMetadata | null;
  extractionJob: Pick<ExtractionJob, "fileName"> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cellString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function emptyContributorAffiliationCells(): Record<string, string> {
  const cells: Record<string, string> = {};
  for (let slot = 1; slot <= BULK_REVIEW_CONTRIBUTOR_AFFILIATION_SLOT_COUNT; slot++) {
    cells[contributorAffiliationNameFillKey(slot)] = "";
    cells[contributorAffiliationRorFillKey(slot)] = "";
  }
  return cells;
}

function contributorAffiliationCellsFromList(
  affiliations: unknown[],
): Record<string, string> {
  const cells = emptyContributorAffiliationCells();
  affiliations.forEach((aff, affIndex) => {
    const slot = affIndex + 1;
    if (slot > BULK_REVIEW_CONTRIBUTOR_AFFILIATION_SLOT_COUNT) return;

    if (typeof aff === "string") {
      const name = aff.trim();
      if (!name) return;
      cells[contributorAffiliationNameFillKey(slot)] = name;
      return;
    }

    const affObj = asRecord(aff);
    const affName = cellString(affObj?.name);
    if (!affName) return;
    cells[contributorAffiliationNameFillKey(slot)] = affName;
    cells[contributorAffiliationRorFillKey(slot)] = cellString(
      affObj?.affiliationIdentifier,
    );
  });
  return cells;
}

function normalizePosterContent(raw: unknown) {
  const record = asRecord(raw);
  if (Array.isArray(raw)) {
    return { sections: raw, unstructuredContent: "", submissionAbstract: "" };
  }
  const sections = asArray(record?.sections);
  return {
    sections,
    unstructuredContent: cellString(record?.unstructuredContent),
    submissionAbstract: cellString(record?.submissionAbstract),
  };
}

function presentedStartDateFromMetadata(meta: PosterMetadata) {
  const datesArr = asArray(meta.dates) as Array<{
    date?: string;
    dateType?: string;
  }>;
  const presented = datesArr.find((d) => d.dateType === "Presented");
  if (!presented?.date) return "";
  return presented.date.split("/")[0] ?? "";
}

function writeRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  values: Record<string, string | number | undefined>,
  columns: BulkReviewWorkbookColumn[],
) {
  const filled: Record<string, string | number> = {};
  for (const column of columns) {
    if (column.fillKey in values) {
      filled[column.fillKey] = values[column.fillKey] ?? "";
    }
  }
  const row = sheet.getRow(rowIndex);
  columns.forEach((col, index) => {
    if (!(col.fillKey in filled)) return;
    row.getCell(index + 1).value = filled[col.fillKey] ?? "";
  });
  applyBulkReviewWorkbookDataRowLayout(row, columns, filled);
  row.commit();
}

function posterFileName(poster: PosterRow) {
  return poster.extractionJob?.fileName ?? `poster-${poster.id}.pdf`;
}

function clearDataRows(sheet: ExcelJS.Worksheet) {
  const max = sheet.rowCount;
  for (let r = max; r >= BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW; r--) {
    sheet.spliceRows(r, 1);
  }
}

function collectBulkReviewSheetPayloads(
  posters: PosterRow[],
  batchConference?: BulkImportConferenceMetadata | null,
): Array<{ sheetName: string; rows: Record<string, string | number>[] }> {
  const batchConferenceCells =
    bulkReviewWorkbookConferenceCellsFromBatch(batchConference);

  const sheetPayloads: Array<{
    sheetName: string;
    rows: Record<string, string | number>[];
  }> = [];

  sheetPayloads.push({
    sheetName: BULK_REVIEW_WORKBOOK_SHEET_ABOUT,
    rows: posters.map((poster) => {
      const meta = poster.posterMetadata;
      return {
        poster_id: poster.id,
        file_name: poster.extractionJob?.fileName ?? "",
        title: poster.title ?? "",
        description: poster.description ?? "",
        keywords: (meta?.subjects ?? []).join("; "),
      };
    }),
  });

  sheetPayloads.push({
    sheetName: BULK_REVIEW_WORKBOOK_SHEET_CONFERENCE,
    rows: posters.map((poster) => {
      const meta = poster.posterMetadata;
      return {
        poster_id: poster.id,
        file_name: poster.extractionJob?.fileName ?? "",
        conference_name: meta?.conferenceName ?? "",
        conference_year: meta?.conferenceYear ?? "",
        conference_location: meta?.conferenceLocation ?? "",
        conference_acronym: meta?.conferenceAcronym ?? "",
        conference_uri: meta?.conferenceUri ?? "",
        conference_identifier: meta?.conferenceIdentifier ?? "",
        conference_identifier_type: meta?.conferenceIdentifierType ?? "",
        conference_series: meta?.conferenceSeries ?? "",
        conference_start_date: meta?.conferenceStartDate ?? "",
        conference_end_date: meta?.conferenceEndDate ?? "",
        presented_date: meta ? presentedStartDateFromMetadata(meta) : "",
        ...batchConferenceCells,
      };
    }),
  });

  const contributorRows: Record<string, string | number>[] = [];

  for (const poster of posters) {
    const meta = poster.posterMetadata;
    if (!meta) continue;
    const creators = asArray(meta.creators) as Array<Record<string, unknown>>;
    creators.forEach((creator) => {
      const nameIds = asArray(creator.nameIdentifiers) as Array<
        Record<string, unknown>
      >;
      const firstId = nameIds[0];
      const affiliations = asArray(creator.affiliation);
      const affiliationCells = contributorAffiliationCellsFromList(affiliations);

      contributorRows.push({
        poster_id: poster.id,
        given_name: cellString(creator.givenName),
        family_name: cellString(creator.familyName),
        name_type: cellString(creator.nameType) || "Personal",
        name_identifier: cellString(firstId?.nameIdentifier),
        ...affiliationCells,
      });
    });
  }

  sheetPayloads.push({
    sheetName: BULK_REVIEW_WORKBOOK_SHEET_CREATORS,
    rows: contributorRows,
  });

  const additionalRows: Record<string, string | number>[] = [];
  const identifierRows: Record<string, string | number>[] = [];
  const relatedRows: Record<string, string | number>[] = [];
  const fundingRows: Record<string, string | number>[] = [];
  const sectionRows: Record<string, string | number>[] = [];
  const tableCaptionRows: Record<string, string | number>[] = [];
  const imageCaptionRows: Record<string, string | number>[] = [];

  for (const poster of posters) {
    const meta = poster.posterMetadata;
    const file_name = posterFileName(poster);
    const content = meta ? normalizePosterContent(meta.posterContent) : null;

    additionalRows.push({
      poster_id: poster.id,
      file_name,
      submission_abstract: content?.submissionAbstract ?? "",
      language: meta?.language ?? "",
      domain: meta?.domain ?? "",
    });

    if (meta) {
      const identifiers = asArray(meta.identifiers) as Array<
        Record<string, unknown>
      >;
      identifiers.forEach((entry) => {
        identifierRows.push({
          poster_id: poster.id,
          file_name,
          identifier: cellString(entry.identifier),
          identifier_type: cellString(entry.identifierType),
        });
      });
    }

    if (meta) {
      const related = asArray(meta.relatedIdentifiers) as Array<
        Record<string, unknown>
      >;
      related.forEach((rel) => {
        relatedRows.push({
          poster_id: poster.id,
          file_name,
          related_identifier: cellString(rel.relatedIdentifier),
          related_identifier_type: cellString(rel.relatedIdentifierType),
          relation_type: cellString(rel.relationType),
          relation_description: cellString(rel.relationTypeInformation),
          resource_type_general: cellString(rel.resourceTypeGeneral),
        });
      });

      const funding = asArray(meta.fundingReferences) as Array<
        Record<string, unknown>
      >;
      funding.forEach((fund, index) => {
        fundingRows.push({
          poster_id: poster.id,
          file_name,
          funder_name: cellString(fund.funderName),
          funder_identifier_type: cellString(fund.funderIdentifierType),
          funder_identifier: cellString(fund.funderIdentifier),
          scheme_uri: cellString(fund.schemeUri),
          award_number: cellString(fund.awardNumber),
          award_title: cellString(fund.awardTitle),
          award_uri: cellString(fund.awardUri),
        });
      });
    }

    if (!meta) continue;

    const sections = asArray(content?.sections) as Array<
      Record<string, unknown>
    >;
    sections.forEach((section, index) => {
      sectionRows.push({
        poster_id: poster.id,
        file_name,
        section_title: cellString(section.sectionTitle),
        section_content: cellString(section.sectionContent),
      });
    });

    const tables = asArray(meta.tableCaptions) as Array<
      Record<string, unknown>
    >;
    tables.forEach((cap, index) => {
      tableCaptionRows.push({
        poster_id: poster.id,
        file_name,
        item_id: cellString(cap.id),
        caption: cellString(cap.caption),
      });
    });

    const images = asArray(meta.imageCaptions) as Array<
      Record<string, unknown>
    >;
    images.forEach((cap, index) => {
      imageCaptionRows.push({
        poster_id: poster.id,
        file_name,
        item_id: cellString(cap.id),
        caption: cellString(cap.caption),
      });
    });
  }

  sheetPayloads.push({
    sheetName: BULK_REVIEW_WORKBOOK_SHEET_ADDITIONAL,
    rows: additionalRows,
  });
  sheetPayloads.push({
    sheetName: BULK_REVIEW_WORKBOOK_SHEET_IDENTIFIERS,
    rows: identifierRows,
  });
  sheetPayloads.push({
    sheetName: BULK_REVIEW_WORKBOOK_SHEET_RELATED_RESOURCES,
    rows: relatedRows,
  });
  sheetPayloads.push({ sheetName: BULK_REVIEW_WORKBOOK_SHEET_FUNDING, rows: fundingRows });
  sheetPayloads.push({
    sheetName: BULK_REVIEW_WORKBOOK_SHEET_POSTER_CONTENT,
    rows: sectionRows,
  });
  sheetPayloads.push({
    sheetName: BULK_REVIEW_WORKBOOK_SHEET_TABLE_CAPTIONS,
    rows: tableCaptionRows,
  });
  sheetPayloads.push({
    sheetName: BULK_REVIEW_WORKBOOK_SHEET_IMAGE_CAPTIONS,
    rows: imageCaptionRows,
  });

  return sheetPayloads;
}

export type BulkReviewSheetRows = {
  sheetName: string;
  rows: Record<string, string>[];
};

export type BulkReviewPosterRow = PosterRow;

/**
 * Per-sheet rows (one object per row, keyed by fillKey) for the in-app grid:
 * everything currently stored for each poster.
 */
export function buildBulkReviewSheetRows(
  posters: PosterRow[],
  batchConference?: BulkImportConferenceMetadata | null,
): BulkReviewSheetRows[] {
  const payloads = collectBulkReviewSheetPayloads(posters, batchConference);
  return BULK_REVIEW_WORKBOOK_SHEETS.map((sheetDef) => {
    const payload = payloads.find((p) => p.sheetName === sheetDef.name);
    const rows = (payload?.rows ?? []).map((raw) => {
      const row: Record<string, string> = {};
      for (const column of sheetDef.columns) {
        const value = raw[column.fillKey];
        row[column.fillKey] = value == null ? "" : String(value);
      }
      return row;
    });
    return { sheetName: sheetDef.name, rows };
  });
}

export async function buildBulkReviewWorkbookBuffer(
  posters: PosterRow[],
  batchConference?: BulkImportConferenceMetadata | null,
): Promise<Buffer> {
  const sheetPayloads = collectBulkReviewSheetPayloads(posters, batchConference);
  const templatePath = path.join(
    process.cwd(),
    BULK_IMPORT_METADATA_REVIEW_TEMPLATE_RELATIVE_PATH,
  );
  const templateBytes = await readFile(templatePath);
  const workbook = new ExcelJS.Workbook();
  // exceljs declares its own global Buffer that Node's Buffer type no longer matches.
  await workbook.xlsx.load(
    templateBytes as unknown as Parameters<ExcelJS.Xlsx["load"]>[0],
  );

  for (const payload of sheetPayloads) {
    const sheet = workbook.getWorksheet(payload.sheetName);
    if (!sheet) continue;
    const sheetDef = BULK_REVIEW_WORKBOOK_SHEETS.find(
      (def) => def.name === payload.sheetName,
    );
    if (!sheetDef) continue;
    applyBulkReviewWorkbookMetaRows(sheet, sheetDef.columns);
    clearDataRows(sheet);
    let rowIndex = BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW;
    for (const row of payload.rows) {
      writeRow(sheet, rowIndex, row, sheetDef.columns);
      rowIndex += 1;
    }

    applyBulkReviewWorkbookColumnWidths(sheet, sheetDef.columns);
    applyBulkReviewWorkbookSheetProtection(sheet, sheetDef.columns);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
