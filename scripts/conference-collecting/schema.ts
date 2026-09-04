export interface ConferencePosting {
  id: string;
  conferenceName: string;
  conferenceYear: number;
  conferenceLocation?: string;
  conferenceUri?: string;
  conferenceIdentifier?: string;
  conferenceIdentifierType?: string;
  conferenceSchemaUri?: string;
  conferenceStartDate?: string;
  conferenceEndDate?: string;
  conferenceAcronym?: string;
  conferenceSeries?: string;
  _source?: string;
}

export interface ConferencePostingDB {
  metadata: {
    lastUpdated: string;
    totalPostings: number;
    sources: string[];
  };
  postings: ConferencePosting[];
}

export interface DisplayConference {
  label: string;
  value: string;
  acronym?: string;
  url: string;
}

export function toPostersSchemaConference(
  posting: ConferencePosting,
): ConferencePosting {
  return posting;
}
