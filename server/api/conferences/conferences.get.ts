import {
  formatConferenceDate,
  getConferenceAggregatorPool,
} from "../../utils/conferenceAggregatorPg";
import {
  conferenceSearchTermSchema,
  CONFERENCE_SEARCH_RESULT_LIMIT,
  toConferenceLikePattern,
} from "../../utils/conferenceSearch";
import { logwatch } from "../../utils/logwatch";

type ConferenceSearchRow = {
  id: string;
  conferenceName: string;
  conferenceYear: number | null;
  conferenceUri: string | null;
  conferenceLocation: string | null;
  conferenceStartDate: Date | null;
  conferenceEndDate: Date | null;
  conferenceAcronym: string | null;
  conferenceSeries: string | null;
};

export type ConferenceSearchResult = {
  id: string;
  conferenceName: string;
  conferenceYear?: number;
  conferenceAcronym?: string | null;
  conferenceLocation?: string | null;
  conferenceStartDate?: string | null;
  conferenceEndDate?: string | null;
  conferenceUri?: string | null;
  conferenceSeries?: string | null;
};

function rowToResult(row: ConferenceSearchRow): ConferenceSearchResult {
  return {
    id: row.id,
    conferenceName: row.conferenceName,
    conferenceYear: row.conferenceYear ?? undefined,
    conferenceAcronym: row.conferenceAcronym,
    conferenceLocation: row.conferenceLocation,
    conferenceStartDate: formatConferenceDate(row.conferenceStartDate),
    conferenceEndDate: formatConferenceDate(row.conferenceEndDate),
    conferenceUri: row.conferenceUri,
    conferenceSeries: row.conferenceSeries,
  };
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  if (!process.env.CONFERENCE_DATABASE_URL) {
    logwatch.error({
      action: "conference.search",
      message:
        "Conference search is unavailable because CONFERENCE_DATABASE_URL is not configured",
    });

    throw createError({
      statusCode: 500,
      statusMessage: "CONFERENCE_DATABASE_URL is not configured",
    });
  }

  const query = getQuery(event);
  const searchRaw = query.search ?? query.q;
  const searchCandidate =
    typeof searchRaw === "string"
      ? searchRaw.trim()
      : Array.isArray(searchRaw)
        ? String(searchRaw[0] ?? "").trim()
        : "";
  const parsedSearch = conferenceSearchTermSchema.safeParse(searchCandidate);

  if (!parsedSearch.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Search term must be between 2 and 100 characters",
    });
  }

  const search = parsedSearch.data;
  const pattern = toConferenceLikePattern(search);

  let result;
  try {
    result = await getConferenceAggregatorPool().query<ConferenceSearchRow>(
      `
        SELECT
          "id",
          "conferenceName",
          "conferenceYear",
          "conferenceUri",
          "conferenceLocation",
          "conferenceStartDate",
          "conferenceEndDate",
          "conferenceAcronym",
          "conferenceSeries"
        FROM "Conference"
        WHERE
          "conferenceName" ILIKE $1 ESCAPE '\\'
          OR COALESCE("conferenceAcronym", '') ILIKE $1 ESCAPE '\\'
        ORDER BY
          CASE
            WHEN LOWER("conferenceName") = LOWER($3)
              OR LOWER(COALESCE("conferenceAcronym", '')) = LOWER($3)
            THEN 0
            ELSE 1
          END,
          "conferenceStartDate" DESC NULLS LAST,
          "conferenceName" ASC
        LIMIT $2
      `,
      [pattern, CONFERENCE_SEARCH_RESULT_LIMIT, search],
    );
  } catch (error) {
    logwatch.error({
      action: "conference.search",
      message: "Conference aggregator query failed",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      searchLength: search.length,
    });

    throw createError({
      statusCode: 502,
      statusMessage: "Failed to load conferences from aggregator database",
      cause: error,
    });
  }

  return {
    options: result.rows.filter((row) => row.conferenceName).map(rowToResult),
  };
});
