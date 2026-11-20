import type {
  PosterSheetIssue,
  PosterSheetMappingResult,
} from "#shared/types/posterSheetMapping";
import { posterUploadBaseName } from "#shared/utils/bulkPosterUploadFileName";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { requireFeature } from "~~/server/utils/features";

const SHEET_EXTENSIONS = [".xlsx", ".xlsm", ".xls", ".csv", ".tsv"];
const MAX_SHEET_BYTES = 10 * 1024 * 1024;
const MAX_BROWSER_FILE_NAMES = 5000;
/** Sheet formats the organizer can choose; the extraction API checks the columns. */
const SHEET_FORMATS = ["easychair", "curious"];

/**
 * Map an organizer's poster spreadsheet (Curious, EasyChair, our own) onto the
 * metadata grid. Forwards the sheet and this batch's poster file names to the
 * extraction API's POST /sheets/map and returns its result unchanged; nothing
 * is stored here. The wizard shows the result on its confirm screen.
 *
 * multipart/form-data: sheet (file; several for an export split over files,
 * such as EasyChair submission.csv plus author.csv), mapping (optional JSON of
 * confirmed column choices), file_names (optional JSON list of the poster
 * file names the browser has, including ones still uploading), format
 * (optional, easychair or curious: a sheet without that format's columns is
 * refused with 422 and data.code format_mismatch). Rows are
 * linked against those names plus the posters already stored; the pending
 * sheet routes re-link them to the stored names once the uploads land.
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
    const browserNamesRaw = parts
      .find((part) => part.name === "file_names")
      ?.data.toString("utf8");
    const sheetFormat = parts
      .find((part) => part.name === "format")
      ?.data.toString("utf8")
      .trim()
      .toLowerCase();
    if (sheetFormat && !SHEET_FORMATS.includes(sheetFormat)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Choose EasyChair or Curious as the worksheet format",
      });
    }

    if (!sheets.length) {
      throw createError({
        statusCode: 400,
        statusMessage: "Choose a worksheet to upload",
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
        statusMessage: "The worksheet is larger than 10 MB",
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

    let browserNames: string[] = [];
    if (browserNamesRaw) {
      try {
        const parsed: unknown = JSON.parse(browserNamesRaw);
        if (Array.isArray(parsed)) {
          browserNames = parsed
            .filter((name): name is string => typeof name === "string")
            .map((name) => posterUploadBaseName(name).slice(0, 255))
            .filter(Boolean)
            .slice(0, MAX_BROWSER_FILE_NAMES);
        }
      } catch {
        throw createError({
          statusCode: 400,
          statusMessage: "Invalid file name list",
        });
      }
    }

    // Stored posters first; browser names fill in files still uploading.
    const fileNames: string[] = [];
    const seen = new Set<string>();
    for (const name of [
      ...(job.stagedPosters ?? []).map((poster) => poster.fileName),
      ...browserNames,
    ]) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      fileNames.push(name);
    }

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
    if (sheetFormat) form.append("format", sheetFormat);

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
        statusMessage:
          "We couldn't reach the worksheet service. Try again in a moment.",
      });
    }

    const body = (await response.json().catch(() => null)) as
      | (PosterSheetMappingResult & {
          error?: string;
          code?: string;
          missing_columns?: string[];
          detected_format?: string | null;
          issues?: PosterSheetIssue[];
        })
      | null;
    if (!response.ok || !body) {
      throw createError({
        statusCode: response.status >= 500 || !body ? 502 : 422,
        statusMessage: body?.error ?? "We couldn't read this worksheet.",
        // The format check says which columns are missing and, when the
        // sheet is the other known format, which one to choose. Issues say
        // where each problem is (file, sheet, row) for the rejection dialog.
        data: {
          code: body?.code ?? null,
          missingColumns: body?.missing_columns ?? [],
          detectedFormat: body?.detected_format ?? null,
          issues: Array.isArray(body?.issues) ? body.issues : [],
        },
      });
    }

    return body;
  },
);
