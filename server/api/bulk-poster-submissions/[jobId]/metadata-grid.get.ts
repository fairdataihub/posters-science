import {
  BULK_REVIEW_WORKBOOK_SHEET_CONFERENCE,
  BULK_REVIEW_WORKBOOK_SHEETS,
  bulkReviewColumnRequirementFor,
} from "#shared/bulkReviewWorkbookManifest";
import type { BulkReviewMetadataGrid } from "#shared/types/bulkReviewMetadataGrid";
import { buildBulkReviewSheetRows } from "~~/server/utils/bulkReviewWorkbookFill";
import { loadBulkReviewJobPosters } from "~~/server/utils/bulkReviewJobPosters";

/** Batch metadata as editable sheets for the in-app grid (replaces the xlsx download). */
export default defineEventHandler(async (event): Promise<BulkReviewMetadataGrid> => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const { batchConference, orderedPosters } =
    await loadBulkReviewJobPosters(event, session.user.id, jobId, {
      prepare: getQuery(event).refresh !== "1",
    });

  const sheetRows = buildBulkReviewSheetRows(orderedPosters, batchConference);

  return {
    posters: orderedPosters.map((poster) => ({
      id: poster.id,
      fileName: poster.extractionJob?.fileName ?? `poster-${poster.id}.pdf`,
      title: poster.title ?? "",
    })),
    // Conference details are collected once in the wizard's conference step,
    // so the grid does not offer a per-poster Conference tab.
    sheets: BULK_REVIEW_WORKBOOK_SHEETS.filter(
      (sheetDef) => sheetDef.name !== BULK_REVIEW_WORKBOOK_SHEET_CONFERENCE,
    ).map((sheetDef) => ({
      name: sheetDef.name,
      description: sheetDef.description,
      grain: sheetDef.grain,
      repeatable: sheetDef.grain !== "poster",
      rowNoun: sheetDef.rowNoun,
      columns: sheetDef.columns.map((column) => ({
        header: column.header,
        fillKey: column.fillKey,
        requirement: bulkReviewColumnRequirementFor(column),
        system: column.tier === "system",
        instruction: column.instruction,
        hint: column.hint,
        width: column.width,
        wrapText: column.wrapText,
        list: column.list,
      })),
      rows:
        sheetRows.find((entry) => entry.sheetName === sheetDef.name)?.rows ?? [],
    })),
  };
});
