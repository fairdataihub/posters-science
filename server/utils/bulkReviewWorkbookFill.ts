import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Poster, PosterMetadata, ExtractionJob } from "@prisma/client";
import ExcelJS from "exceljs";
import {
  BULK_IMPORT_METADATA_REVIEW_TEMPLATE_RELATIVE_PATH,
  BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW,
  BULK_REVIEW_WORKBOOK_SHEETS,
  type BulkReviewWorkbookColumn,
} from "#shared/bulkReviewWorkbookManifest";
import {
  applyBulkReviewWorkbookPrefillPolicy,
  bulkReviewWorkbookPrefillSummary,
  bulkReviewWorkbookConferenceCellsFromBatch,
  getBulkReviewWorkbookPrefillPolicy,
  type BulkReviewPosterContentKind,
} from "#shared/bulkReviewWorkbookPrefill";
import type { BulkImportConferenceMetadata } from "#shared/types/bulkImportConference";
import type { BulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import { DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD } from "#shared/types/bulkSubmission";
import { applyBulkReviewWorkbookSheetProtection } from "~~/server/utils/bulkReviewWorkbookSheetProtection";
import { applyBulkReviewWorkbookColumnWidths } from "~~/server/utils/bulkReviewWorkbookColumnLayout";

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
  extractionMethod: BulkSubmissionExtractionMethod,
  context?: { contentKind?: BulkReviewPosterContentKind },
) {
  const filtered = applyBulkReviewWorkbookPrefillPolicy(
    extractionMethod,
    columns,
    values as Record<string, string | number>,
    context,
  );
  const row = sheet.getRow(rowIndex);
  columns.forEach((col, index) => {
    if (!(col.fillKey in filtered)) return;
    row.getCell(index + 1).value = filtered[col.fillKey] ?? "";
  });
  row.commit();
}

function patchInstructionsPrefillNote(
  workbook: ExcelJS.Workbook,
  extractionMethod: BulkSubmissionExtractionMethod,
) {
  const sheet = workbook.getWorksheet("Instructions");
  if (!sheet) return;

  sheet.eachRow((row) => {
    const key = cellString(row.getCell(1).value);
    if (key === "minimal_vs_full") {
      row.getCell(2).value = bulkReviewWorkbookPrefillSummary(extractionMethod);
    }
    if (key === "prefill_level") {
      row.getCell(2).value =
        extractionMethod === "minimal"
          ? "High confidence only"
          : "Extract everything we can";
    }
  });
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

export async function buildBulkReviewWorkbookBuffer(
  posters: PosterRow[],
  extractionMethod: BulkSubmissionExtractionMethod = DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD,
  batchConference?: BulkImportConferenceMetadata | null,
): Promise<Buffer> {
  const prefillPolicy = getBulkReviewWorkbookPrefillPolicy(extractionMethod);
  const batchConferenceCells =
    bulkReviewWorkbookConferenceCellsFromBatch(batchConference);
  const templatePath = path.join(
    process.cwd(),
    BULK_IMPORT_METADATA_REVIEW_TEMPLATE_RELATIVE_PATH,
  );
  const templateBytes = await readFile(templatePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBytes);

  const sheetPayloads: Array<{
    sheetName: string;
    rows: Record<string, string | number>[];
  }> = [];

  sheetPayloads.push({
    sheetName: "About the poster",
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
    sheetName: "Conference",
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
        conference_start_date: meta?.conferenceStartDate ?? "",
        conference_end_date: meta?.conferenceEndDate ?? "",
        presented_date: meta ? presentedStartDateFromMetadata(meta) : "",
        ...batchConferenceCells,
      };
    }),
  });

  const creatorRows: Record<string, string | number>[] = [];
  for (const poster of posters) {
    const meta = poster.posterMetadata;
    if (!meta) continue;
    const creators = asArray(meta.creators) as Array<Record<string, unknown>>;
    creators.forEach((creator, index) => {
      const order = index + 1;
      const nameIds = asArray(creator.nameIdentifiers) as Array<
        Record<string, unknown>
      >;
      const firstId = nameIds[0];
      const baseCreator = {
        poster_id: poster.id,
        file_name: poster.extractionJob?.fileName ?? "",
        creator_order: order,
        name_type: cellString(creator.nameType) || "Personal",
        given_name: cellString(creator.givenName),
        family_name: cellString(creator.familyName),
        name_identifier: cellString(firstId?.nameIdentifier),
        name_identifier_scheme: cellString(firstId?.nameIdentifierScheme),
      };

      const affiliations = asArray(creator.affiliation);
      if (affiliations.length === 0) {
        creatorRows.push({
          ...baseCreator,
          affiliation_order: "",
          affiliation_name: "",
          affiliation_identifier: "",
        });
        return;
      }

      affiliations.forEach((aff, affIndex) => {
        if (typeof aff === "string") {
          creatorRows.push({
            ...baseCreator,
            affiliation_order: affIndex + 1,
            affiliation_name: aff,
            affiliation_identifier: "",
          });
          return;
        }
        const affObj = asRecord(aff);
        creatorRows.push({
          ...baseCreator,
          affiliation_order: affIndex + 1,
          affiliation_name: cellString(affObj?.name),
          affiliation_identifier: cellString(affObj?.affiliationIdentifier),
        });
      });
    });
  }
  sheetPayloads.push({ sheetName: "Creators", rows: creatorRows });

  sheetPayloads.push({
    sheetName: "Additional Information",
    rows: posters.map((poster) => {
      const meta = poster.posterMetadata;
      const content = meta ? normalizePosterContent(meta.posterContent) : null;
      return {
        poster_id: poster.id,
        file_name: poster.extractionJob?.fileName ?? "",
        submission_abstract: content?.submissionAbstract ?? "",
        language: meta?.language ?? "",
        domain: meta?.domain ?? "",
        license: meta?.license ?? "",
        version: meta?.version ?? "",
        doi: meta?.doi ?? "",
        publisher: meta?.publisher ?? "",
        publication_year: meta?.publicationYear ?? "",
      };
    }),
  });

  const linksRows: Record<string, string | number>[] = [];
  const contentRows: Record<string, string | number>[] = [];

  for (const poster of posters) {
    const meta = poster.posterMetadata;
    if (!meta) continue;
    const file_name = posterFileName(poster);

    if (prefillPolicy.includeLinksAndFunding) {
      const related = asArray(meta.relatedIdentifiers) as Array<
        Record<string, unknown>
      >;
      related.forEach((rel, index) => {
        linksRows.push({
          poster_id: poster.id,
          file_name,
          kind: "related",
          entry_order: index + 1,
          related_identifier: cellString(rel.relatedIdentifier),
          related_identifier_type: cellString(rel.relatedIdentifierType),
          relation_type: cellString(rel.relationType),
          relation_description: cellString(rel.relationTypeInformation),
          resource_type_general: cellString(rel.resourceTypeGeneral),
          funder_name: "",
          funder_identifier_type: "",
          funder_identifier: "",
          scheme_uri: "",
          award_number: "",
          award_title: "",
          award_uri: "",
        });
      });

      const funding = asArray(meta.fundingReferences) as Array<
        Record<string, unknown>
      >;
      funding.forEach((fund, index) => {
        linksRows.push({
          poster_id: poster.id,
          file_name,
          kind: "funding",
          entry_order: index + 1,
          related_identifier: "",
          related_identifier_type: "",
          relation_type: "",
          relation_description: "",
          resource_type_general: "",
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

    const content = normalizePosterContent(meta.posterContent);
    const allowedKinds = new Set(prefillPolicy.posterContentKinds);

    if (allowedKinds.has("section")) {
      const sections = asArray(content.sections) as Array<
        Record<string, unknown>
      >;
      sections.forEach((section, index) => {
        contentRows.push({
          poster_id: poster.id,
          file_name,
          content_kind: "section",
          item_order: index + 1,
          item_id: "",
          title: cellString(section.sectionTitle),
          body: cellString(section.sectionContent),
        });
      });
    }

    if (allowedKinds.has("figure")) {
      const images = asArray(meta.imageCaptions) as Array<
        Record<string, unknown>
      >;
      images.forEach((cap, index) => {
        contentRows.push({
          poster_id: poster.id,
          file_name,
          content_kind: "figure",
          item_order: index + 1,
          item_id: cellString(cap.id),
          title: "",
          body: cellString(cap.caption),
        });
      });
    }

    if (allowedKinds.has("table")) {
      const tables = asArray(meta.tableCaptions) as Array<
        Record<string, unknown>
      >;
      tables.forEach((cap, index) => {
        contentRows.push({
          poster_id: poster.id,
          file_name,
          content_kind: "table",
          item_order: index + 1,
          item_id: cellString(cap.id),
          title: "",
          body: cellString(cap.caption),
        });
      });
    }
  }

  sheetPayloads.push({ sheetName: "Links & funding", rows: linksRows });
  sheetPayloads.push({ sheetName: "Poster content", rows: contentRows });

  for (const payload of sheetPayloads) {
    const sheet = workbook.getWorksheet(payload.sheetName);
    if (!sheet) continue;
    const sheetDef = BULK_REVIEW_WORKBOOK_SHEETS.find(
      (def) => def.name === payload.sheetName,
    );
    if (!sheetDef) continue;
    clearDataRows(sheet);
    let rowIndex = BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW;
    for (const row of payload.rows) {
      const contentKindRaw = row.content_kind;
      const contentKind =
        typeof contentKindRaw === "string" &&
        (contentKindRaw === "section" ||
          contentKindRaw === "figure" ||
          contentKindRaw === "table")
          ? contentKindRaw
          : undefined;
      writeRow(
        sheet,
        rowIndex,
        row,
        sheetDef.columns,
        extractionMethod,
        contentKind ? { contentKind } : undefined,
      );
      rowIndex += 1;
    }

    applyBulkReviewWorkbookColumnWidths(sheet, sheetDef.columns);
    applyBulkReviewWorkbookSheetProtection(sheet, sheetDef.columns);
  }

  patchInstructionsPrefillNote(workbook, extractionMethod);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
