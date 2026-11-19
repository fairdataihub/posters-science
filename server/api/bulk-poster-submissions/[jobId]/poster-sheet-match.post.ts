import type {
  PosterSheetMatchResult,
  PosterSheetMatchRow,
  PosterSheetPair,
} from "#shared/types/posterSheetMapping";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { requireFeature } from "~~/server/utils/features";

const MAX_ITEMS = 2000;

type MatchBody = {
  rows?: Pick<
    PosterSheetMatchRow,
    "row_key" | "title" | "authors" | "suggested_file"
  >[];
  posters?: { file_name: string; title: string; authors: string[] }[];
  pairs?: Pick<
    PosterSheetPair,
    "row_key" | "file_name" | "title" | "authors" | "method"
  >[];
};

/**
 * Match poster sheet rows that have no file yet to this batch's extracted
 * posters by title (authors as a tiebreaker, a file suggested by the row's
 * number taken only when its title agrees), and title-check rows already
 * paired with a file. Forwards to the extraction API's POST /sheets/match and
 * returns its result; nothing is stored here. Only file names staged in this
 * batch are sent.
 */
export default defineEventHandler(
  async (event): Promise<PosterSheetMatchResult> => {
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

    const body = (await readBody<MatchBody>(event)) ?? {};
    const staged = new Set(
      (job.stagedPosters ?? []).map((poster) => poster.fileName),
    );
    const rows = (Array.isArray(body.rows) ? body.rows : []).map((row) =>
      row.suggested_file && !staged.has(row.suggested_file)
        ? { ...row, suggested_file: undefined }
        : row,
    );
    const posters = (Array.isArray(body.posters) ? body.posters : []).filter(
      (poster) => staged.has(poster.file_name),
    );
    const pairs = (Array.isArray(body.pairs) ? body.pairs : []).filter((pair) =>
      staged.has(pair.file_name),
    );
    if (
      rows.length > MAX_ITEMS ||
      posters.length > MAX_ITEMS ||
      pairs.length > MAX_ITEMS
    ) {
      throw createError({
        statusCode: 413,
        statusMessage: `At most ${MAX_ITEMS} rows, posters and pairs`,
      });
    }
    if (!posters.length || (!rows.length && !pairs.length)) {
      return {
        matches: [],
        unmatched_rows: rows.map((row) => ({
          row_key: row.row_key,
          title: row.title,
          closest: null,
        })),
        unmatched_files: posters.map((poster) => poster.file_name),
        pair_checks: [],
        flagged: [],
      };
    }

    let response: Response;
    try {
      response = await fetch(`${posterExtractionApi}/sheets/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, posters, pairs }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      console.error("[poster-sheet] extraction API unreachable", error);
      throw createError({
        statusCode: 502,
        statusMessage: "Could not reach the sheet matching service",
      });
    }

    const result = (await response.json().catch(() => null)) as
      | (PosterSheetMatchResult & { error?: string })
      | null;
    if (!response.ok || !result) {
      throw createError({
        statusCode: response.status >= 500 || !result ? 502 : 422,
        statusMessage: result?.error ?? "Could not match the sheet rows",
      });
    }

    return result;
  },
);
