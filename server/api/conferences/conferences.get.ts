import {
  formatConferenceDate,
  getConferenceAggregatorPool,
  type ConferenceAggregatorRow,
} from "../../utils/conferenceAggregatorPg";

type ConferencePosting = {
  id: string;
  conferenceName: string;
  conferenceYear?: number;
  conferenceLocation?: string | null;
  conferenceUri?: string | null;
  conferenceIdentifier?: string;
  conferenceIdentifierType?: string;
  conferenceSchemaUri?: string;
  conferenceStartDate?: string | null;
  conferenceEndDate?: string | null;
  conferenceAcronym?: string | null;
  conferenceSeries?: string | null;
  _sources?: string[];
  collectionDate?: string | null;
  conferenceCategories?: string[] | null;
  conferenceText?: string | null;
  submissionDeadline?: string | null;
};

function rowToPosting(row: ConferenceAggregatorRow): ConferencePosting {
  return {
    id: row.id,
    conferenceName: row.conferenceName,
    conferenceYear: row.conferenceYear ?? undefined,
    conferenceLocation: row.conferenceLocation,
    conferenceUri: row.conferenceUri,
    conferenceStartDate: formatConferenceDate(row.conferenceStartDate),
    conferenceEndDate: formatConferenceDate(row.conferenceEndDate),
    conferenceAcronym: row.conferenceAcronym,
    conferenceSeries: row.conferenceSeries,
    _sources: row.sources,
    collectionDate: formatConferenceDate(row.collectionDate),
    conferenceCategories: row.conferenceCategories,
    conferenceText: row.conferenceText,
    submissionDeadline: formatConferenceDate(row.submissionDeadline),
  };
}

function postingsToOptions(postings: ConferencePosting[]) {
  const conferences = new Map<string, ConferencePosting>();

  for (const posting of postings) {
    const key = posting.conferenceName;
    if (!key) continue;

    if (!conferences.has(key)) {
      conferences.set(key, posting);
    }
  }

  return [...conferences.values()]
    .sort((a, b) => a.conferenceName.localeCompare(b.conferenceName))
    .map((conference) => ({
      label: conference.conferenceName,
      value: conference.conferenceName,
      conferenceName: conference.conferenceName,
      conferenceYear: conference.conferenceYear,
      conferenceAcronym: conference.conferenceAcronym,
      conferenceLocation: conference.conferenceLocation,
      conferenceIdentifier: conference.conferenceIdentifier,
      conferenceIdentifierType: conference.conferenceIdentifierType,
      conferenceStartDate: conference.conferenceStartDate,
      conferenceEndDate: conference.conferenceEndDate,
      conferenceUri: conference.conferenceUri,
      conferenceSeries: conference.conferenceSeries,
      source: (conference._sources ?? []).join(", "),
    }));
}

export default defineEventHandler(async (event) => {
  if (!process.env.CONFERENCE_AGGREGATOR_DATABASE_URL) {
    throw createError({
      statusCode: 500,
      statusMessage: "CONFERENCE_AGGREGATOR_DATABASE_URL is not configured",
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
    return { options: [] };
  }

  const pattern = `%${search}%`;

  let result;
  try {
    result = await getConferenceAggregatorPool().query<ConferenceAggregatorRow>(
      `
        SELECT
          id,
          "collectionDate",
          sources,
          "conferenceName",
          "conferenceYear",
          "conferenceUri",
          "conferenceLocation",
          "conferenceStartDate",
          "conferenceEndDate",
          "conferenceAcronym",
          "conferenceSeries",
          "conferenceCategories",
          "conferenceText",
          "submissionDeadline"
        FROM "Conference"
        WHERE
          "conferenceName" ILIKE $1
          OR COALESCE("conferenceAcronym", '') ILIKE $1
        ORDER BY "conferenceName" ASC
      `,
      [pattern],
    );
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to load conferences from aggregator database",
      cause: error,
    });
  }

  const options = postingsToOptions(result.rows.map(rowToPosting));

  return { options };
});
