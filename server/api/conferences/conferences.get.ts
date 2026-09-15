type ConferencePosting = {
  id: string;
  conferenceName: string;
  conferenceYear: number;
  conferenceLocation?: string | null;
  conferenceUri?: string | null;
  conferenceIdentifier?: string;
  conferenceIdentifierType?: string;
  conferenceSchemaUri?: string;
  conferenceStartDate?: string | null;
  conferenceEndDate?: string | null;
  conferenceAcronym?: string | null;
  conferenceSeries?: string | null;
  _source?: string;
  collectionDate?: string | null;
  conferenceCategories?: string[] | null;
  conferenceText?: string | null;
  submissionDeadline?: string | null;
};

type ConferenceAggregatorJson =
  | { metadata?: unknown; postings?: ConferencePosting[] }
  | ConferencePosting[];

export default defineEventHandler(async () => {
  // Get the conference postings from the main branch of the conference-aggregator repository.
  const postingsUrl =
    "https://raw.githubusercontent.com/fairdataihub/conference-aggregator/main/conference-postings.json";

  const res = await fetch(postingsUrl, {
    headers: {
      "User-Agent": "posters-science/conferences.get",
    },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch conference postings from ${postingsUrl}: ${res.status} ${res.statusText}`,
    );
  }

  // Parse the conference postings from the JSON response.
  const json = (await res.json()) as ConferenceAggregatorJson;
  const postings: ConferencePosting[] = Array.isArray(json) ? json : (json.postings ?? []);

  // Create a map to store the conference data by conference name.
  const conferences = new Map<string, ConferencePosting>();

  // Store the conference data in a map by conference name.
  for (const posting of postings) {
    const key = posting.conferenceName;
    if (!key) continue;

    const existing = conferences.get(key);
    if (!existing) {
      conferences.set(key, posting);
    }
  }

  // Sort the conferences by name and return the options.
  const options = [...conferences.values()]
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
      source: conference._source,
    }));

  return { options };
});