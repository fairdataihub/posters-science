import type { Prisma } from "#shared/generated/client";
import type { BulkImportValidationIssue } from "#shared/types/bulkImportValidation";
import type { BulkReviewWorkbookImportResult } from "#shared/types/bulkReviewWorkbookImport";
import { bulkImportValidationResult } from "#shared/utils/bulkImportValidation";
import {
  BULK_REVIEW_WORKBOOK_HEADER_ROW,
  bulkReviewWorkbookDetectFirstDataRow,
  BULK_REVIEW_WORKBOOK_SHEETS,
  BULK_REVIEW_CONTRIBUTOR_AFFILIATION_SLOT_COUNT,
  BULK_REVIEW_WORKBOOK_SHEET_ABOUT,
  BULK_REVIEW_WORKBOOK_SHEET_ADDITIONAL,
  BULK_REVIEW_WORKBOOK_SHEET_RELATED_RESOURCES,
  BULK_REVIEW_WORKBOOK_SHEET_CONFERENCE,
  BULK_REVIEW_WORKBOOK_SHEET_CREATORS,
  BULK_REVIEW_WORKBOOK_SHEET_FUNDING,
  BULK_REVIEW_WORKBOOK_SHEET_IMAGE_CAPTIONS,
  BULK_REVIEW_WORKBOOK_SHEET_POSTER_CONTENT,
  BULK_REVIEW_WORKBOOK_SHEET_TABLE_CAPTIONS,
  bulkReviewWorkbookResolveSheetName,
  contributorAffiliationNameFillKey,
  contributorAffiliationRorFillKey,
  type BulkReviewWorkbookSheet,
} from "#shared/bulkReviewWorkbookManifest";
import ExcelJS from "exceljs";
import {
  inferAffiliationIdentifierScheme,
  inferNameIdentifierScheme,
  normalizeAffiliationIdentifierToUrl,
  normalizeNameIdentifierToUrl,
  schemeUriForScheme,
} from "~~/app/utils/poster_schema";
import { conferenceYearFromStartDate } from "#shared/types/bulkImportConference";
import prisma from "~~/server/utils/prisma";
import { posterIdsFromBulkSubmissionSummary } from "~~/server/utils/bulkImportDashboard";

type RowValues = Record<string, string>;

type PosterImportPatch = {
  about?: { title: string; description: string; keywords: string };
  conference?: RowValues;
  additional?: RowValues;
  contributorRows: RowValues[];
  affiliationRows: RowValues[];
  relatedResourceRows: RowValues[];
  fundingRows: RowValues[];
  sectionRows: RowValues[];
  tableCaptionRows: RowValues[];
  imageCaptionRows: RowValues[];
  /** @deprecated Legacy workbook tabs */
  identifierRows: RowValues[];
  linkRows: RowValues[];
  contentRows: RowValues[];
};

function emptyPatch(): PosterImportPatch {
  return {
    contributorRows: [],
    affiliationRows: [],
    relatedResourceRows: [],
    fundingRows: [],
    sectionRows: [],
    tableCaptionRows: [],
    imageCaptionRows: [],
    identifierRows: [],
    linkRows: [],
    contentRows: [],
  };
}

function findWorksheet(
  workbook: ExcelJS.Workbook,
  canonicalSheetName: string,
): ExcelJS.Worksheet | undefined {
  for (const name of bulkReviewWorkbookResolveSheetName(canonicalSheetName)) {
    const sheet = workbook.getWorksheet(name);
    if (sheet) return sheet;
  }
  return undefined;
}

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

    if (sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_CREATORS) {
      const normalized = header.trim().toLowerCase();
      if (normalized === "name identifier") {
        indexByFillKey.set("name_identifier", col);
      } else if (
        normalized === "identifier scheme" ||
        normalized === "name identifier scheme"
      ) {
        indexByFillKey.set("name_identifier_scheme", col);
      } else if (
        normalized === "identifier scheme uri" ||
        normalized === "name identifier scheme uri"
      ) {
        indexByFillKey.set("name_identifier_scheme_uri", col);
      } else if (normalized === "affiliation name") {
        indexByFillKey.set(contributorAffiliationNameFillKey(1), col);
      } else if (normalized === "affiliation ror identifier") {
        indexByFillKey.set(contributorAffiliationRorFillKey(1), col);
      } else if (normalized === "creator order") {
        indexByFillKey.set("creator_order", col);
      }
    }

    if (sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_ADDITIONAL) {
      const normalized = header.trim().toLowerCase();
      if (normalized === "entry order") {
        indexByFillKey.set("entry_order", col);
      }
    }

    if (sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_FUNDING) {
      const normalized = header.trim().toLowerCase();
      if (normalized === "entry order") {
        indexByFillKey.set("entry_order", col);
      }
    }

    if (sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_RELATED_RESOURCES) {
      const normalized = header.trim().toLowerCase();
      if (normalized === "entry order") {
        indexByFillKey.set("entry_order", col);
      }
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
  if (sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_CREATORS) {
    return [
      ...keys,
      "creator_order",
      "name_identifier_scheme",
      "name_identifier_scheme_uri",
      "contributor_affiliation_name",
      "contributor_affiliation_ror",
    ];
  }
  if (sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_ADDITIONAL) {
    return [
      ...keys,
      "entry_order",
      "related_identifier",
      "related_identifier_type",
      "relation_type",
      "relation_description",
      "resource_type_general",
    ];
  }
  if (sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_RELATED_RESOURCES) {
    return [...keys, "entry_order"];
  }
  if (sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_FUNDING) {
    return [...keys, "entry_order"];
  }
  if (sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_POSTER_CONTENT) {
    return [...keys, "section_order", "content_kind", "title", "body", "item_order"];
  }
  if (
    sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_TABLE_CAPTIONS ||
    sheetDef.name === BULK_REVIEW_WORKBOOK_SHEET_IMAGE_CAPTIONS
  ) {
    return [...keys, "item_order", "body"];
  }
  return keys;
}

function enrichAffiliationIdentifier(
  affId: string,
  affScheme: string,
  affSchemeUri: string,
): {
  affiliationIdentifier?: string;
  affiliationIdentifierScheme?: string;
  schemeURI?: string;
} {
  let id = affId;
  let scheme = affScheme;
  let schemeUri = affSchemeUri;
  if (id && !scheme) {
    const inferred = inferAffiliationIdentifierScheme(id);
    if (inferred) {
      scheme = inferred.scheme;
      schemeUri = inferred.schemeURI;
      if (!id.trim().startsWith("http")) {
        const normalized = normalizeAffiliationIdentifierToUrl(
          id,
          inferred.scheme,
        );
        if (normalized) id = normalized;
      }
    }
  }
  if (!schemeUri && scheme) {
    schemeUri = schemeUriForScheme(scheme) ?? "";
  }
  return {
    ...(id && { affiliationIdentifier: id }),
    ...(scheme && { affiliationIdentifierScheme: scheme }),
    ...(schemeUri && { schemeURI: schemeUri }),
  };
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
      patch = emptyPatch();
      patches.set(posterId, patch);
    }
    return patch;
  }

  for (const sheetDef of BULK_REVIEW_WORKBOOK_SHEETS) {
    const sheet = findWorksheet(workbook, sheetDef.name);
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
    const firstDataRow = bulkReviewWorkbookDetectFirstDataRow(
      sheet,
      sheetDef.columns.length,
    );

    for (let rowNumber = firstDataRow; rowNumber <= sheet.rowCount; rowNumber++) {
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
        case BULK_REVIEW_WORKBOOK_SHEET_ABOUT:
          patch.about = {
            title: values.title ?? "",
            description: values.description ?? "",
            keywords: values.keywords ?? "",
          };
          break;
        case BULK_REVIEW_WORKBOOK_SHEET_CREATORS:
          if (values.given_name?.trim() || values.family_name?.trim()) {
            patch.contributorRows.push(values);
          }
          break;
        case BULK_REVIEW_WORKBOOK_SHEET_CONFERENCE:
          patch.conference = values;
          break;
        case BULK_REVIEW_WORKBOOK_SHEET_ADDITIONAL: {
          const hasRelated =
            values.related_identifier?.trim() ||
            values.related_identifier_type?.trim() ||
            values.relation_type?.trim();
          if (hasRelated) {
            patch.relatedResourceRows.push(values);
          }
          if (
            values.submission_abstract?.trim() ||
            values.language?.trim() ||
            values.domain?.trim()
          ) {
            patch.additional = { ...(patch.additional ?? {}), ...values };
          }
          break;
        }
        case BULK_REVIEW_WORKBOOK_SHEET_RELATED_RESOURCES:
          if (
            values.related_identifier?.trim() ||
            values.related_identifier_type?.trim() ||
            values.relation_type?.trim()
          ) {
            patch.relatedResourceRows.push(values);
          }
          break;
        case BULK_REVIEW_WORKBOOK_SHEET_FUNDING:
          if (
            values.funder_name?.trim() ||
            values.award_number?.trim() ||
            values.funder_identifier?.trim()
          ) {
            patch.fundingRows.push(values);
          }
          break;
        case BULK_REVIEW_WORKBOOK_SHEET_POSTER_CONTENT:
          if (
            values.section_title?.trim() ||
            values.section_content?.trim() ||
            values.title?.trim() ||
            values.body?.trim()
          ) {
            if (values.content_kind?.trim()) {
              patch.contentRows.push(values);
            } else {
              patch.sectionRows.push({
                ...values,
                section_title: values.section_title ?? values.title ?? "",
                section_content: values.section_content ?? values.body ?? "",
              });
            }
          }
          break;
        case BULK_REVIEW_WORKBOOK_SHEET_TABLE_CAPTIONS:
          if (values.caption?.trim() || values.item_id?.trim()) {
            patch.tableCaptionRows.push(values);
          }
          break;
        case BULK_REVIEW_WORKBOOK_SHEET_IMAGE_CAPTIONS:
          if (values.caption?.trim() || values.item_id?.trim()) {
            patch.imageCaptionRows.push(values);
          }
          break;
        default:
          break;
      }
    }
  }

  parseLegacyOptionalSheets(workbook, allowedPosterIds, issues, patchFor);

  return patches;
}

/** Older workbook layouts (extra tabs or combined sheets). */
function parseLegacyOptionalSheets(
  workbook: ExcelJS.Workbook,
  allowedPosterIds: Set<number>,
  issues: BulkImportValidationIssue[],
  patchFor: (posterId: number) => PosterImportPatch,
) {
  const affiliationsSheet = workbook.getWorksheet("Affiliations");
  if (affiliationsSheet) {
    const sheetDef = BULK_REVIEW_WORKBOOK_SHEETS.find(
      (s) => s.name === BULK_REVIEW_WORKBOOK_SHEET_CREATORS,
    );
    if (!sheetDef) return;

    const legacyAffDef: BulkReviewWorkbookSheet = {
      name: "Affiliations",
      description: "legacy",
      grain: "affiliation",
      columns: [
        {
          header: "Poster ID",
          fillKey: "poster_id",
          schemaPath: "",
          tier: "system",
        },
        {
          header: "Creator order",
          fillKey: "creator_order",
          schemaPath: "",
          tier: "system",
        },
        {
          header: "Affiliation name",
          fillKey: "affiliation_name",
          schemaPath: "",
          tier: "minimal",
        },
        {
          header: "Affiliation identifier",
          fillKey: "affiliation_identifier",
          schemaPath: "",
          tier: "minimal",
        },
        {
          header: "Affiliation order",
          fillKey: "affiliation_order",
          schemaPath: "",
          tier: "system",
        },
        {
          header: "Identifier scheme",
          fillKey: "affiliation_identifier_scheme",
          schemaPath: "",
          tier: "optional",
        },
        {
          header: "Scheme URI",
          fillKey: "affiliation_scheme_uri",
          schemaPath: "",
          tier: "optional",
        },
      ],
    };

    ingestLegacySheetRows(
      affiliationsSheet,
      legacyAffDef,
      allowedPosterIds,
      issues,
      (posterId, values) => {
        if (values.affiliation_name?.trim()) {
          patchFor(posterId).affiliationRows.push(values);
        }
      },
    );
  }

  const linksSheet = workbook.getWorksheet("Links & funding");
  if (linksSheet) {
    const legacyLinksDef: BulkReviewWorkbookSheet = {
      name: "Links & funding",
      description: "legacy",
      grain: "links",
      columns: [
        { header: "Poster ID", fillKey: "poster_id", schemaPath: "", tier: "system" },
        { header: "Kind", fillKey: "kind", schemaPath: "", tier: "system" },
        { header: "Entry order", fillKey: "entry_order", schemaPath: "", tier: "system" },
        {
          header: "Related identifier",
          fillKey: "related_identifier",
          schemaPath: "",
          tier: "optional",
        },
        {
          header: "Related identifier type",
          fillKey: "related_identifier_type",
          schemaPath: "",
          tier: "optional",
        },
        { header: "Relation type", fillKey: "relation_type", schemaPath: "", tier: "optional" },
        {
          header: "Relation description",
          fillKey: "relation_description",
          schemaPath: "",
          tier: "optional",
        },
        {
          header: "Resource type",
          fillKey: "resource_type_general",
          schemaPath: "",
          tier: "optional",
        },
        { header: "Funder name", fillKey: "funder_name", schemaPath: "", tier: "optional" },
        {
          header: "Funder identifier type",
          fillKey: "funder_identifier_type",
          schemaPath: "",
          tier: "optional",
        },
        {
          header: "Funder identifier",
          fillKey: "funder_identifier",
          schemaPath: "",
          tier: "optional",
        },
        { header: "Scheme URI", fillKey: "scheme_uri", schemaPath: "", tier: "optional" },
        { header: "Award number", fillKey: "award_number", schemaPath: "", tier: "optional" },
        { header: "Award title", fillKey: "award_title", schemaPath: "", tier: "optional" },
        { header: "Award URI", fillKey: "award_uri", schemaPath: "", tier: "optional" },
      ],
    };

    ingestLegacySheetRows(
      linksSheet,
      legacyLinksDef,
      allowedPosterIds,
      issues,
      (posterId, values) => {
        if ((values.kind ?? "").trim()) {
          patchFor(posterId).linkRows.push(values);
        }
      },
    );
  }

  const identifiersSheet = workbook.getWorksheet("Poster identifiers");
  if (identifiersSheet) {
    const legacyIdDef: BulkReviewWorkbookSheet = {
      name: "Poster identifiers",
      description: "legacy",
      grain: "links",
      columns: [
        { header: "Poster ID", fillKey: "poster_id", schemaPath: "", tier: "system" },
        { header: "Entry order", fillKey: "entry_order", schemaPath: "", tier: "system" },
        { header: "Identifier", fillKey: "identifier", schemaPath: "", tier: "optional" },
        {
          header: "Identifier type",
          fillKey: "identifier_type",
          schemaPath: "",
          tier: "optional",
        },
      ],
    };
    ingestLegacySheetRows(
      identifiersSheet,
      legacyIdDef,
      allowedPosterIds,
      issues,
      (posterId, values) => {
        if (values.identifier?.trim() || values.identifier_type?.trim()) {
          patchFor(posterId).identifierRows.push(values);
        }
      },
    );
  }
}

function ingestLegacySheetRows(
  sheet: ExcelJS.Worksheet,
  sheetDef: BulkReviewWorkbookSheet,
  allowedPosterIds: Set<number>,
  issues: BulkImportValidationIssue[],
  onRow: (posterId: number, values: RowValues) => void,
) {
  const indexByFillKey = columnIndexByFillKey(sheet, sheetDef);
  const fillKeys = sheetDef.columns.map((c) => c.fillKey);
  const firstDataRow = bulkReviewWorkbookDetectFirstDataRow(
    sheet,
    sheetDef.columns.length,
  );

  for (let rowNumber = firstDataRow; rowNumber <= sheet.rowCount; rowNumber++) {
    const values = readSheetRow(sheet, rowNumber, indexByFillKey, fillKeys);
    const posterId = parsePosterId(values.poster_id ?? "", issues, rowNumber);
    if (posterId == null) continue;
    if (!allowedPosterIds.has(posterId)) continue;
    onRow(posterId, values);
  }
}

function buildAffiliationFromRow(row: RowValues) {
  const affName = row.affiliation_name?.trim();
  if (!affName) return null;
  const affId = row.affiliation_identifier?.trim() ?? "";
  const affScheme = row.affiliation_identifier_scheme?.trim() ?? "";
  let affSchemeUri = row.affiliation_scheme_uri?.trim() ?? "";
  const enriched = enrichAffiliationIdentifier(affId, affScheme, affSchemeUri);
  return {
    name: affName,
    ...enriched,
  };
}

function buildInlineAffiliationsFromContributorRow(
  row: RowValues,
): Array<Record<string, unknown>> {
  const affiliations: Array<Record<string, unknown>> = [];

  for (
    let slot = 1;
    slot <= BULK_REVIEW_CONTRIBUTOR_AFFILIATION_SLOT_COUNT;
    slot++
  ) {
    const affName = row[contributorAffiliationNameFillKey(slot)]?.trim();
    if (!affName) continue;
    const affId = row[contributorAffiliationRorFillKey(slot)]?.trim() ?? "";
    affiliations.push({
      name: affName,
      ...enrichAffiliationIdentifier(affId, "", ""),
    });
  }

  const legacyName = row.contributor_affiliation_name?.trim();
  if (legacyName && affiliations.length === 0) {
    const affId = row.contributor_affiliation_ror?.trim() ?? "";
    affiliations.push({
      name: legacyName,
      ...enrichAffiliationIdentifier(affId, "", ""),
    });
  }

  return affiliations;
}

function buildCreatorFromContributorRow(
  row: RowValues,
  affiliations: Array<Record<string, unknown>>,
) {
  const givenName = row.given_name?.trim() ?? "";
  const familyName = row.family_name?.trim() ?? "";
  const nameType = row.name_type?.trim() || "Personal";
  const name =
    [givenName, familyName].filter(Boolean).join(" ") || "Unknown Creator";

  const nameIdentifier = row.name_identifier?.trim() ?? "";
  let nameIdentifierScheme = row.name_identifier_scheme?.trim() ?? "";
  let nameSchemeUri = row.name_identifier_scheme_uri?.trim() ?? "";
  if (nameIdentifier && !nameIdentifierScheme) {
    const inferred = inferNameIdentifierScheme(nameIdentifier);
    if (inferred) {
      nameIdentifierScheme = inferred.scheme;
      nameSchemeUri = inferred.schemeURI;
    }
  }
  if (!nameSchemeUri && nameIdentifierScheme) {
    nameSchemeUri = schemeUriForScheme(nameIdentifierScheme) ?? "";
  }
  let normalizedNameIdentifier = nameIdentifier;
  if (
    nameIdentifier &&
    nameIdentifierScheme &&
    !nameIdentifier.trim().startsWith("http")
  ) {
    const normalized = normalizeNameIdentifierToUrl(
      nameIdentifier,
      nameIdentifierScheme,
    );
    if (normalized) normalizedNameIdentifier = normalized;
  }

  return {
    name,
    ...(givenName && { givenName }),
    ...(familyName && { familyName }),
    nameType,
    ...(normalizedNameIdentifier && {
      nameIdentifiers: [
        {
          nameIdentifier: normalizedNameIdentifier,
          ...(nameIdentifierScheme && { nameIdentifierScheme }),
          ...(nameSchemeUri && { schemeURI: nameSchemeUri }),
        },
      ],
    }),
    ...(affiliations.length > 0 && { affiliation: affiliations }),
  };
}

function buildCreatorsFromContributorsAndAffiliations(
  contributorRows: RowValues[],
  affiliationRows: RowValues[],
) {
  const affiliationsByCreatorOrder = new Map<number, RowValues[]>();

  for (const row of affiliationRows) {
    const order = parseOptionalInt(row.creator_order ?? "") ?? 0;
    if (order <= 0) continue;
    const group = affiliationsByCreatorOrder.get(order) ?? [];
    group.push(row);
    affiliationsByCreatorOrder.set(order, group);
  }

  for (const group of affiliationsByCreatorOrder.values()) {
    group.sort((a, b) => {
      const affA = parseOptionalInt(a.affiliation_order ?? "") ?? 0;
      const affB = parseOptionalInt(b.affiliation_order ?? "") ?? 0;
      if (affA !== affB) return affA - affB;
      return 0;
    });
  }

  const creators: Array<Record<string, unknown>> = [];

  contributorRows.forEach((row, index) => {
    const order = parseOptionalInt(row.creator_order ?? "") ?? index + 1;
    const affRows = affiliationsByCreatorOrder.get(order) ?? [];
    const fromSheet = affRows
      .map((affRow) => buildAffiliationFromRow(affRow))
      .filter(Boolean) as Array<Record<string, unknown>>;

    let affiliations = buildInlineAffiliationsFromContributorRow(row);

    if (fromSheet.length > 0) {
      if (affiliations.length === 0) {
        affiliations = fromSheet;
      } else {
        const names = new Set(
          affiliations.map((aff) => String(aff.name ?? "").toLowerCase()),
        );
        for (const aff of fromSheet) {
          const key = String(aff.name ?? "").toLowerCase();
          if (key && !names.has(key)) {
            affiliations.push(aff);
            names.add(key);
          }
        }
      }
    }

    creators.push(buildCreatorFromContributorRow(row, affiliations));
  });

  return creators;
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

function buildIdentifiersFromRows(rows: RowValues[]) {
  const identifiers: Array<{ identifier: string; identifierType?: string }> =
    [];
  for (const row of rows) {
    const identifier = row.identifier?.trim();
    if (!identifier) continue;
    identifiers.push({
      identifier,
      ...(row.identifier_type?.trim() && {
        identifierType: row.identifier_type.trim(),
      }),
    });
  }
  return identifiers;
}

function buildRelatedFromResourceRows(rows: RowValues[]) {
  const relatedIdentifiers: Array<Record<string, unknown>> = [];
  for (const row of rows) {
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
  }
  return relatedIdentifiers;
}

function buildFundingFromRows(rows: RowValues[]) {
  const fundingReferences: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const funderName = row.funder_name?.trim();
    const awardNumber = row.award_number?.trim();
    if (!funderName && !awardNumber && !row.funder_identifier?.trim()) continue;

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
      ...(awardNumber && { awardNumber }),
      ...(row.award_title?.trim() && { awardTitle: row.award_title.trim() }),
      ...(row.award_uri?.trim() && { awardUri: row.award_uri.trim() }),
    });
  }
  return fundingReferences;
}

function buildSectionsFromRows(rows: RowValues[]) {
  return rows
    .map((row) => ({
      sectionTitle:
        row.section_title?.trim() ?? row.title?.trim() ?? "",
      sectionContent:
        row.section_content?.trim() ?? row.body?.trim() ?? "",
    }))
    .filter((section) => section.sectionTitle || section.sectionContent);
}

function buildCaptionsFromRows(rows: RowValues[]) {
  return rows
    .map((row) => ({
      ...(row.item_id?.trim() ? { id: row.item_id.trim() } : {}),
      caption: row.caption?.trim() ?? row.body?.trim() ?? "",
    }))
    .filter((cap) => cap.caption);
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
    const startTrimmed = c.conference_start_date?.trim() ?? "";
    if ("conference_start_date" in c) {
      data.conferenceStartDate = startTrimmed || null;
    }
    const yearFromSheet = parseOptionalInt(c.conference_year ?? "");
    const yearFromStart = startTrimmed
      ? conferenceYearFromStartDate(startTrimmed)
      : null;
    const year = yearFromSheet ?? yearFromStart;
    if (year != null) data.conferenceYear = year;
    if (c.conference_location?.trim()) {
      data.conferenceLocation = c.conference_location.trim();
    }
    if (c.conference_acronym?.trim()) {
      data.conferenceAcronym = c.conference_acronym.trim();
    }
    if (c.conference_uri?.trim()) data.conferenceUri = c.conference_uri.trim();
    if (c.conference_identifier?.trim()) {
      data.conferenceIdentifier = c.conference_identifier.trim();
    }
    if (c.conference_identifier_type?.trim()) {
      data.conferenceIdentifierType = c.conference_identifier_type.trim();
    }
    if (c.conference_series?.trim()) {
      data.conferenceSeries = c.conference_series.trim();
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
  }

  if (patch.identifierRows.length > 0) {
    data.identifiers = buildIdentifiersFromRows(
      patch.identifierRows,
    ) as Prisma.InputJsonValue;
  }

  if (patch.contributorRows.length > 0) {
    data.creators = buildCreatorsFromContributorsAndAffiliations(
      patch.contributorRows,
      patch.affiliationRows,
    ) as Prisma.InputJsonValue;
  }

  const legacyLinks = buildRelatedAndFunding(patch.linkRows);
  const relatedIdentifiers = [
    ...buildRelatedFromResourceRows(patch.relatedResourceRows),
    ...legacyLinks.relatedIdentifiers,
  ];
  if (relatedIdentifiers.length > 0) {
    data.relatedIdentifiers = relatedIdentifiers as Prisma.InputJsonValue;
  }

  const fundingReferences = [
    ...buildFundingFromRows(patch.fundingRows),
    ...legacyLinks.fundingReferences,
  ];
  if (fundingReferences.length > 0) {
    data.fundingReferences = fundingReferences as Prisma.InputJsonValue;
  }

  const sectionRows = [
    ...patch.sectionRows,
    ...patch.contentRows.filter(
      (row) => (row.content_kind ?? "").trim().toLowerCase() === "section",
    ),
  ];
  const hasSectionUpdates = sectionRows.length > 0;
  const hasLegacyContent = patch.contentRows.some(
    (row) => (row.content_kind ?? "").trim().toLowerCase() !== "section",
  );

  if (hasSectionUpdates || hasLegacyContent) {
    const existingRaw = meta.posterContent;
    const base = Array.isArray(existingRaw)
      ? { sections: existingRaw, unstructuredContent: "", submissionAbstract: "" }
      : { ...((existingRaw as object) ?? {}) };

    let sections = buildSectionsFromRows(sectionRows);
    let imageCaptions = buildCaptionsFromRows(patch.imageCaptionRows);
    let tableCaptions = buildCaptionsFromRows(patch.tableCaptionRows);

    if (hasLegacyContent) {
      const content = buildPosterContentFromRows(patch.contentRows, {
        posterContent: meta.posterContent,
        imageCaptions: meta.imageCaptions,
        tableCaptions: meta.tableCaptions,
      });
      if (sections.length === 0) sections = content.sections;
      if (imageCaptions.length === 0) {
        imageCaptions = content.imageCaptions as Array<{
          id?: string;
          caption: string;
        }>;
      }
      if (tableCaptions.length === 0) {
        tableCaptions = content.tableCaptions as Array<{
          id?: string;
          caption: string;
        }>;
      }
    }

    data.posterContent = {
      ...base,
      sections,
      submissionAbstract:
        patch.additional?.submission_abstract?.trim() ??
        (typeof (base as { submissionAbstract?: string }).submissionAbstract ===
        "string"
          ? (base as { submissionAbstract?: string }).submissionAbstract
          : ""),
    } as Prisma.InputJsonValue;

    if (imageCaptions.length > 0) {
      data.imageCaptions = imageCaptions as Prisma.InputJsonValue;
    }
    if (tableCaptions.length > 0) {
      data.tableCaptions = tableCaptions as Prisma.InputJsonValue;
    }
  } else {
    if (patch.imageCaptionRows.length > 0) {
      data.imageCaptions = buildCaptionsFromRows(
        patch.imageCaptionRows,
      ) as Prisma.InputJsonValue;
    }
    if (patch.tableCaptionRows.length > 0) {
      data.tableCaptions = buildCaptionsFromRows(
        patch.tableCaptionRows,
      ) as Prisma.InputJsonValue;
    }
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
      patch.contributorRows.length > 0 ||
      patch.affiliationRows.length > 0 ||
      patch.relatedResourceRows.length > 0 ||
      patch.fundingRows.length > 0 ||
      patch.sectionRows.length > 0 ||
      patch.tableCaptionRows.length > 0 ||
      patch.imageCaptionRows.length > 0 ||
      patch.identifierRows.length > 0 ||
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
