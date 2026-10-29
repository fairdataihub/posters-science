import type { Prisma } from "#shared/generated/client";
import type { BulkImportValidationIssue } from "#shared/types/bulkImportValidation";
import type { BulkReviewWorkbookImportResult } from "#shared/types/bulkReviewWorkbookImport";
import { bulkImportValidationResult } from "#shared/utils/bulkImportValidation";
import {
  BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW,
  BULK_REVIEW_WORKBOOK_HEADER_ROW,
  BULK_REVIEW_WORKBOOK_SHEETS,
  type BulkReviewWorkbookSheet,
} from "#shared/bulkReviewWorkbookManifest";
import ExcelJS from "exceljs";
import { schemeUriForScheme } from "~~/app/utils/poster_schema";
import prisma from "~~/server/utils/prisma";
import { posterIdsFromBulkSubmissionSummary } from "~~/server/utils/bulkImportDashboard";

const LEGACY_CONTENT_HEADERS: Record<string, string> = {
  "Content kind": "content_kind",
  "Item order": "item_order",
  "Item ID": "item_id",
};

type RowValues = Record<string, string>;

type PosterImportPatch = {
  about?: { title: string; description: string; keywords: string };
  conference?: RowValues;
  additional?: RowValues;
  creatorRows: RowValues[];
  linkRows: RowValues[];
  contentRows: RowValues[];
};

function cellText(value: ExcelJS.CellValue | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object" && "text" in value) {
    return String((value as { text?: string }).text ?? "").trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") return value.trim();
  return "";
}

function parsePosterId(raw: string, issues: BulkImportValidationIssue[], rowNumber: number) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const id = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(id) || id <= 0) {
    issues.push({
      code: "invalid_poster_id",
      message: `Row ${rowNumber}: Poster ID "${raw}" is not valid.`,
      severity: "error",
      rowNumber,
      field: "poster_id",
    });
    return null;
  }
  return id;
}

function columnIndexByFillKey(
  sheet: ExcelJS.Worksheet,
  sheetDef: BulkReviewWorkbookSheet,
): Map<string, number> {
  const indexByFillKey = new Map<string, number>();

  sheetDef.columns.forEach((column, index) => {
    indexByFillKey.set(column.fillKey, index + 1);
  });

  const headerRow = sheet.getRow(BULK_REVIEW_WORKBOOK_HEADER_ROW);
  const maxCol = Math.max(sheet.columnCount, sheetDef.columns.length + 2);

  for (let col = 1; col <= maxCol; col++) {
    const header = cellText(headerRow.getCell(col).value);
    if (!header) continue;

    const fromManifest = sheetDef.columns.find((column) => column.header === header);
    if (fromManifest) {
      indexByFillKey.set(fromManifest.fillKey, col);
      continue;
    }

    const legacyFillKey = LEGACY_CONTENT_HEADERS[header];
    if (legacyFillKey) {
      indexByFillKey.set(legacyFillKey, col);
    }
  }

  return indexByFillKey;
}

function readSheetRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  indexByFillKey: Map<string, number>,
  fillKeys: string[],
): RowValues {
  const row = sheet.getRow(rowNumber);
  const values: RowValues = {};
  for (const fillKey of fillKeys) {
    const col = indexByFillKey.get(fillKey);
    if (!col) {
      values[fillKey] = "";
      continue;
    }
    values[fillKey] = cellText(row.getCell(col).value);
  }
  return values;
}

function allFillKeysForSheet(sheetDef: BulkReviewWorkbookSheet): string[] {
  const keys = sheetDef.columns.map((column) => column.fillKey);
  if (sheetDef.grain === "content") {
    for (const legacy of ["content_kind", "item_order", "item_id"]) {
      if (!keys.includes(legacy)) keys.push(legacy);
    }
  }
  return keys;
}

function parseWorkbookSheets(
  workbook: ExcelJS.Workbook,
  allowedPosterIds: Set<number>,
  issues: BulkImportValidationIssue[],
): Map<number, PosterImportPatch> {
  const patches = new Map<number, PosterImportPatch>();

  function patchFor(posterId: number): PosterImportPatch {
    let patch = patches.get(posterId);
    if (!patch) {
      patch = { creatorRows: [], linkRows: [], contentRows: [] };
      patches.set(posterId, patch);
    }
    return patch;
  }

  for (const sheetDef of BULK_REVIEW_WORKBOOK_SHEETS) {
    const sheet = workbook.getWorksheet(sheetDef.name);
    if (!sheet) {
      issues.push({
        code: "missing_sheet",
        message: `Workbook is missing the "${sheetDef.name}" sheet.`,
        severity: "warning",
      });
      continue;
    }

    const indexByFillKey = columnIndexByFillKey(sheet, sheetDef);
    const fillKeys = allFillKeysForSheet(sheetDef);

    for (
      let rowNumber = BULK_REVIEW_WORKBOOK_FIRST_DATA_ROW;
      rowNumber <= sheet.rowCount;
      rowNumber++
    ) {
      const values = readSheetRow(sheet, rowNumber, indexByFillKey, fillKeys);
      const posterId = parsePosterId(values.poster_id ?? "", issues, rowNumber);
      if (posterId == null) continue;

      if (!allowedPosterIds.has(posterId)) {
        issues.push({
          code: "poster_not_in_batch",
          message: `Row ${rowNumber} on "${sheetDef.name}": poster ${posterId} is not part of this bulk import.`,
          severity: "error",
          rowNumber,
          field: "poster_id",
        });
        continue;
      }

      const patch = patchFor(posterId);

      switch (sheetDef.name) {
        case "About the poster":
          patch.about = {
            title: values.title ?? "",
            description: values.description ?? "",
            keywords: values.keywords ?? "",
          };
          break;
        case "Conference":
          patch.conference = values;
          break;
        case "Additional Information":
          patch.additional = values;
          break;
        case "Creators":
          if (
            values.given_name?.trim() ||
            values.family_name?.trim() ||
            values.affiliation_name?.trim()
          ) {
            patch.creatorRows.push(values);
          }
          break;
        case "Links & funding":
          if ((values.kind ?? "").trim()) {
            patch.linkRows.push(values);
          }
          break;
        case "Poster content":
          if ((values.title ?? "").trim() || (values.body ?? "").trim()) {
            patch.contentRows.push(values);
          }
          break;
        default:
          break;
      }
    }
  }

  return patches;
}

function parseKeywords(raw: string): string[] {
  return Array.from(
    new Map(
      raw
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((subject) => [subject.toLowerCase(), subject]),
    ).values(),
  );
}

function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : null;
}

function buildCreatorsFromRows(rows: RowValues[]) {
  const sorted = [...rows].sort((a, b) => {
    const orderA = parseOptionalInt(a.creator_order ?? "") ?? 0;
    const orderB = parseOptionalInt(b.creator_order ?? "") ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    const affA = parseOptionalInt(a.affiliation_order ?? "") ?? 0;
    const affB = parseOptionalInt(b.affiliation_order ?? "") ?? 0;
    return affA - affB;
  });

  const byCreatorOrder = new Map<number, RowValues[]>();
  for (const row of sorted) {
    const order = parseOptionalInt(row.creator_order ?? "") ?? byCreatorOrder.size + 1;
    const group = byCreatorOrder.get(order) ?? [];
    group.push(row);
    byCreatorOrder.set(order, group);
  }

  const creators: Array<Record<string, unknown>> = [];

  for (const [, group] of [...byCreatorOrder.entries()].sort((a, b) => a[0] - b[0])) {
    const first = group[0]!;
    const givenName = first.given_name?.trim() ?? "";
    const familyName = first.family_name?.trim() ?? "";
    const nameType = first.name_type?.trim() || "Personal";
    const name = [givenName, familyName].filter(Boolean).join(" ") || "Unknown Creator";

    const nameIdentifier = first.name_identifier?.trim();
    const nameIdentifierScheme = first.name_identifier_scheme?.trim();

    const affiliations = group
      .map((row) => {
        const affName = row.affiliation_name?.trim();
        if (!affName) return null;
        const affId = row.affiliation_identifier?.trim();
        return {
          name: affName,
          ...(affId && { affiliationIdentifier: affId }),
        };
      })
      .filter(Boolean);

    creators.push({
      name,
      ...(givenName && { givenName }),
      ...(familyName && { familyName }),
      nameType,
      ...(nameIdentifier && {
        nameIdentifiers: [
          {
            nameIdentifier,
            ...(nameIdentifierScheme && { nameIdentifierScheme }),
          },
        ],
      }),
      ...(affiliations.length > 0 && { affiliation: affiliations }),
    });
  }

  return creators;
}

function buildRelatedAndFunding(linkRows: RowValues[]) {
  const relatedIdentifiers: Array<Record<string, unknown>> = [];
  const fundingReferences: Array<Record<string, unknown>> = [];

  for (const row of linkRows) {
    const kind = (row.kind ?? "").trim().toLowerCase();
    if (kind === "related") {
      const relatedIdentifier = row.related_identifier?.trim();
      if (!relatedIdentifier) continue;
      relatedIdentifiers.push({
        relatedIdentifier,
        ...(row.related_identifier_type?.trim() && {
          relatedIdentifierType: row.related_identifier_type.trim(),
        }),
        ...(row.relation_type?.trim() && {
          relationType: row.relation_type.trim(),
        }),
        ...(row.relation_description?.trim() && {
          relationTypeInformation: row.relation_description.trim(),
        }),
        ...(row.resource_type_general?.trim() && {
          resourceTypeGeneral: row.resource_type_general.trim(),
        }),
      });
      continue;
    }

    if (kind === "funding") {
      const funderName = row.funder_name?.trim();
      const awardNumber = row.award_number?.trim();
      if (!funderName && !awardNumber) continue;

      let schemeUri = row.scheme_uri?.trim();
      const funderIdentifierType = row.funder_identifier_type?.trim();
      if (!schemeUri && funderIdentifierType) {
        schemeUri = schemeUriForScheme(funderIdentifierType) ?? "";
      }

      fundingReferences.push({
        ...(funderName && { funderName }),
        ...(funderIdentifierType && { funderIdentifierType }),
        ...(row.funder_identifier?.trim() && {
          funderIdentifier: row.funder_identifier.trim(),
        }),
        ...(schemeUri && { schemeUri }),
        ...(awardNumber && { awardNumber: awardNumber }),
        ...(row.award_title?.trim() && { awardTitle: row.award_title.trim() }),
        ...(row.award_uri?.trim() && { awardUri: row.award_uri.trim() }),
      });
    }
  }

  return { relatedIdentifiers, fundingReferences };
}

function buildPosterContentFromRows(
  rows: RowValues[],
  existing: {
    posterContent: unknown;
    imageCaptions: unknown;
    tableCaptions: unknown;
  },
) {
  const existingImages = Array.isArray(existing.imageCaptions)
    ? (existing.imageCaptions as Array<{ id?: string; caption?: string }>)
    : [];
  const existingTables = Array.isArray(existing.tableCaptions)
    ? (existing.tableCaptions as Array<{ id?: string; caption?: string }>)
    : [];

  const rawContent = existing.posterContent;
  const contentObj = Array.isArray(rawContent)
    ? { sections: rawContent, unstructuredContent: "", submissionAbstract: "" }
    : ((rawContent as Record<string, unknown>) ?? {});

  const sections: Array<{ sectionTitle: string; sectionContent: string }> = [];
  const explicitFigures: Array<{ id: string; caption: string }> = [];
  const explicitTables: Array<{ id: string; caption: string }> = [];
  const captionOnlyRows: RowValues[] = [];

  for (const row of rows) {
    const kind = (row.content_kind ?? "").trim().toLowerCase();
    const title = row.title?.trim() ?? "";
    const body = row.body?.trim() ?? "";

    if (kind === "section") {
      sections.push({ sectionTitle: title, sectionContent: body });
      continue;
    }
    if (kind === "figure") {
      explicitFigures.push({ id: row.item_id?.trim() ?? "", caption: body });
      continue;
    }
    if (kind === "table") {
      explicitTables.push({ id: row.item_id?.trim() ?? "", caption: body });
      continue;
    }
    if (title) {
      sections.push({ sectionTitle: title, sectionContent: body });
    } else if (body) {
      captionOnlyRows.push(row);
    }
  }

  if (explicitFigures.length > 0 || explicitTables.length > 0) {
    return {
      sections,
      unstructuredContent: cellText(
        contentObj.unstructuredContent as ExcelJS.CellValue,
      ),
      submissionAbstract: cellText(
        contentObj.submissionAbstract as ExcelJS.CellValue,
      ),
      imageCaptions: explicitFigures,
      tableCaptions: explicitTables,
    };
  }

  const imageCaptions: Array<{ id?: string; caption: string }> = [];
  const tableCaptions: Array<{ id?: string; caption: string }> = [];

  let captionIndex = 0;
  for (
    ;
    captionIndex < captionOnlyRows.length && captionIndex < existingImages.length;
    captionIndex++
  ) {
    imageCaptions.push({
      id: existingImages[captionIndex]?.id ?? "",
      caption: captionOnlyRows[captionIndex]!.body?.trim() ?? "",
    });
  }
  const tableStart = captionIndex;
  for (
    ;
    captionIndex < captionOnlyRows.length &&
    captionIndex - tableStart < existingTables.length;
    captionIndex++
  ) {
    const tableIdx = captionIndex - tableStart;
    tableCaptions.push({
      id: existingTables[tableIdx]?.id ?? "",
      caption: captionOnlyRows[captionIndex]!.body?.trim() ?? "",
    });
  }
  for (; captionIndex < captionOnlyRows.length; captionIndex++) {
    imageCaptions.push({
      id: "",
      caption: captionOnlyRows[captionIndex]!.body?.trim() ?? "",
    });
  }

  return {
    sections,
    unstructuredContent: cellText(
      contentObj.unstructuredContent as ExcelJS.CellValue,
    ),
    submissionAbstract: cellText(
      contentObj.submissionAbstract as ExcelJS.CellValue,
    ),
    imageCaptions,
    tableCaptions,
  };
}

function mergePresentedDate(
  existingDates: unknown,
  presentedStartDate: string,
): Prisma.InputJsonValue {
  const preserved = Array.isArray(existingDates)
    ? (existingDates as Array<{ date?: string; dateType?: string }>).filter(
        (entry) => entry.dateType !== "Presented",
      )
    : [];

  const start = presentedStartDate.trim();
  if (!start) return preserved as Prisma.InputJsonValue;

  return [
    { date: start, dateType: "Presented" },
    ...preserved,
  ] as Prisma.InputJsonValue;
}

async function applyPatchToPoster(
  userId: string,
  posterId: number,
  patch: PosterImportPatch,
): Promise<void> {
  const poster = await prisma.poster.findFirst({
    where: { id: posterId, userId },
    include: { posterMetadata: true },
  });

  if (!poster?.posterMetadata) return;

  const meta = poster.posterMetadata;
  const data: Prisma.PosterMetadataUpdateInput = {};
  const posterUpdate: Prisma.PosterUpdateInput = {};

  if (patch.about) {
    posterUpdate.title = patch.about.title.trim() || poster.title;
    posterUpdate.description =
      patch.about.description.trim() || poster.description;
    data.subjects = parseKeywords(patch.about.keywords);
  }

  if (patch.conference) {
    const c = patch.conference;
    if (c.conference_name?.trim()) {
      data.conferenceName = c.conference_name.trim();
    }
    const year = parseOptionalInt(c.conference_year ?? "");
    if (year != null) data.conferenceYear = year;
    if (c.conference_location?.trim()) {
      data.conferenceLocation = c.conference_location.trim();
    }
    if (c.conference_acronym?.trim()) {
      data.conferenceAcronym = c.conference_acronym.trim();
    }
    if (c.conference_uri?.trim()) data.conferenceUri = c.conference_uri.trim();
    if ("conference_start_date" in c) {
      data.conferenceStartDate = c.conference_start_date?.trim() || null;
    }
    if ("conference_end_date" in c) {
      data.conferenceEndDate = c.conference_end_date?.trim() || null;
    }
    if ("presented_date" in c) {
      data.dates = mergePresentedDate(meta.dates, c.presented_date ?? "");
    }
  }

  if (patch.additional) {
    const a = patch.additional;
    const existingContent = meta.posterContent;
    const contentRecord = Array.isArray(existingContent)
      ? { sections: existingContent, unstructuredContent: "", submissionAbstract: "" }
      : { ...(existingContent as object) };

    const nextContent = {
      ...contentRecord,
      submissionAbstract: a.submission_abstract?.trim() ?? "",
    };

    data.posterContent = nextContent as Prisma.InputJsonValue;
    data.language = a.language?.trim() || null;
    data.domain = a.domain?.trim() || null;
    data.license = a.license?.trim() || null;
    data.version = a.version?.trim() || null;
    data.doi = a.doi?.trim() || null;
    data.publisher = a.publisher?.trim() || null;
    data.publicationYear = parseOptionalInt(a.publication_year ?? "");
  }

  if (patch.creatorRows.length > 0) {
    data.creators = buildCreatorsFromRows(patch.creatorRows) as Prisma.InputJsonValue;
  }

  if (patch.linkRows.length > 0) {
    const { relatedIdentifiers, fundingReferences } = buildRelatedAndFunding(
      patch.linkRows,
    );
    data.relatedIdentifiers = relatedIdentifiers as Prisma.InputJsonValue;
    data.fundingReferences = fundingReferences as Prisma.InputJsonValue;
  }

  if (patch.contentRows.length > 0) {
    const content = buildPosterContentFromRows(patch.contentRows, {
      posterContent: meta.posterContent,
      imageCaptions: meta.imageCaptions,
      tableCaptions: meta.tableCaptions,
    });

    const existingRaw = meta.posterContent;
    const base = Array.isArray(existingRaw)
      ? { sections: existingRaw, unstructuredContent: "", submissionAbstract: "" }
      : { ...((existingRaw as object) ?? {}) };

    data.posterContent = {
      ...base,
      sections: content.sections,
      unstructuredContent: content.unstructuredContent,
      submissionAbstract:
        patch.additional?.submission_abstract?.trim() ??
        content.submissionAbstract,
    } as Prisma.InputJsonValue;
    data.imageCaptions = content.imageCaptions as Prisma.InputJsonValue;
    data.tableCaptions = content.tableCaptions as Prisma.InputJsonValue;
  }

  if (Object.keys(data).length === 0 && Object.keys(posterUpdate).length === 0) {
    return;
  }

  await prisma.poster.update({
    where: { id: posterId },
    data: {
      ...posterUpdate,
      ...(Object.keys(data).length > 0 && {
        posterMetadata: { update: data },
      }),
    },
  });
}

export async function importBulkReviewWorkbookFromBuffer(
  userId: string,
  jobSubmissionSummary: unknown,
  fileBuffer: Buffer,
): Promise<BulkReviewWorkbookImportResult> {
  const issues: BulkImportValidationIssue[] = [];
  const allowedPosterIds = new Set(
    posterIdsFromBulkSubmissionSummary(jobSubmissionSummary),
  );

  if (allowedPosterIds.size === 0) {
    return {
      updatedPosterIds: [],
      issues: [
        {
          code: "no_posters",
          message: "This bulk import has no submitted posters yet.",
          severity: "error",
        },
      ],
    };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const patches = parseWorkbookSheets(workbook, allowedPosterIds, issues);

  if (patches.size === 0) {
    issues.push({
      code: "no_rows",
      message: "No data rows were found in the workbook.",
      severity: "error",
    });
  }

  const validation = bulkImportValidationResult(issues);
  if (!validation.valid) {
    return { updatedPosterIds: [], issues: validation.issues };
  }

  const updatedPosterIds: number[] = [];

  for (const [posterId, patch] of patches) {
    const hasUpdates =
      patch.about ||
      patch.conference ||
      patch.additional ||
      patch.creatorRows.length > 0 ||
      patch.linkRows.length > 0 ||
      patch.contentRows.length > 0;

    if (!hasUpdates) continue;

    await applyPatchToPoster(userId, posterId, patch);
    updatedPosterIds.push(posterId);
  }

  if (updatedPosterIds.length === 0 && !issues.some((i) => i.severity === "error")) {
    issues.push({
      code: "nothing_to_apply",
      message: "No editable values were found to apply.",
      severity: "error",
    });
    return { updatedPosterIds: [], issues };
  }

  return {
    updatedPosterIds,
    issues: bulkImportValidationResult(issues).issues,
  };
}
