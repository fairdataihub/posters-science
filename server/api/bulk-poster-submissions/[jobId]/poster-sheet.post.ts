import type { PosterSheetMappingResult } from "#shared/types/posterSheetMapping";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { requireFeature } from "~~/server/utils/features";

const SHEET_EXTENSIONS = [".xlsx", ".xlsm", ".xls", ".csv", ".tsv"];
const MAX_SHEET_BYTES = 10 * 1024 * 1024;

/**
 * Map an organizer's poster spreadsheet (Curious, EasyChair, our own) onto the
 * metadata grid. Forwards the sheet and this batch's poster file names to the
 * extraction API's POST /sheets/map and returns its result unchanged; nothing
 * is stored here. The wizard shows the result on its confirm screen.
 *
 * multipart/form-data: sheet (file; several for an export split over files,
 * such as EasyChair submission.csv plus author.csv), mapping (optional JSON of
 * confirmed column choices).
 */
export default defineEventHandler(
  async (event): Promise<PosterSheetMappingResult> => {
    requireFeature("poster_sheet_mapping", event);
    const session = await requireDbUserSession(event);
    const jobId = getRouterParam(event, "jobId");

    if (!jobId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Job id is required",
      });
    }

    const job = await getBulkPosterSubmissionJobRepository().getByIdForUser(
      jobId,
      session.user.id,
    );
    if (!job) {
      throw createError({
        statusCode: 404,
        statusMessage: "Bulk import not found",
      });
    }

    const { posterExtractionApi } = useRuntimeConfig(event);
    if (!posterExtractionApi) {
      throw createError({
        statusCode: 503,
        statusMessage: "Poster sheet mapping is not configured",
      });
    }

    const parts = (await readMultipartFormData(event)) ?? [];
    const sheets = parts.filter(
      (part) => part.name === "sheet" && part.filename,
    );
    const mapping = parts
      .find((part) => part.name === "mapping")
      ?.data.toString("utf8");

    if (!sheets.length) {
      throw createError({
        statusCode: 400,
        statusMessage: "Choose a spreadsheet to upload",
      });
    }
    const wrongType = sheets.some((sheet) => {
      const lower = (sheet.filename ?? "").toLowerCase();

      return !SHEET_EXTENSIONS.some((ext) => lower.endsWith(ext));
    });
    if (wrongType) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "Poster information must be an .xlsx, .xls, .csv or .tsv file",
      });
    }
    const totalBytes = sheets.reduce(
      (sum, sheet) => sum + sheet.data.length,
      0,
    );
    if (totalBytes > MAX_SHEET_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: "Spreadsheet is larger than 10 MB",
      });
    }
    if (mapping) {
      try {
        JSON.parse(mapping);
      } catch {
        throw createError({
          statusCode: 400,
          statusMessage: "Invalid column mapping",
        });
      }
    }

    const fileNames = (job.stagedPosters ?? []).map(
      (poster) => poster.fileName,
    );

    const form = new FormData();
    for (const sheet of sheets) {
      form.append(
        "sheet",
        new Blob([new Uint8Array(sheet.data)], {
          type: sheet.type || "application/octet-stream",
        }),
        sheet.filename,
      );
    }
    form.append("file_names", JSON.stringify(fileNames));
    if (mapping) form.append("mapping", mapping);

    let response: Response;
    try {
      response = await fetch(`${posterExtractionApi}/sheets/map`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      console.error("[poster-sheet] extraction API unreachable", error);
      throw createError({
        statusCode: 502,
        statusMessage: "Could not reach the sheet mapping service",
      });
    }

    const body = (await response.json().catch(() => null)) as
      | (PosterSheetMappingResult & { error?: string })
      | null;
    if (!response.ok || !body) {
      throw createError({
        statusCode: response.status >= 500 || !body ? 502 : 422,
        statusMessage: body?.error ?? "Could not read this spreadsheet",
      });
    }

    return body;
  },
);
