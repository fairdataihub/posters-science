import {
  formatConferenceDate,
  getConferenceAggregatorPool,
} from "../../utils/conferenceAggregatorPg";
import { logwatch } from "../../utils/logwatch";

type ConferenceSearchRow = {
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
  const search =
    typeof searchRaw === "string"
      ? searchRaw.trim()
      : Array.isArray(searchRaw)
        ? String(searchRaw[0] ?? "").trim()
        : "";

  if (!search) {
    return { options: [] as ConferenceSearchResult[] };
  }

  const pattern = `%${search}%`;

  let result;
  try {
    result = await getConferenceAggregatorPool().query<ConferenceSearchRow>(
      `
        SELECT
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
          "conferenceName" ILIKE $1
          OR COALESCE("conferenceAcronym", '') ILIKE $1
        ORDER BY "conferenceName" ASC
      `,
      [pattern],
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
