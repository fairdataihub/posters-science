/**
 * Represents a collected conference record with metadata extracted from various sources.
 * All date fields are ISO 8601 format (YYYY-MM-DD).
 */
export interface CollectedConference {
  /** Unique identifier for deduplication purposes */
  id: string;
  /** Full name of the conference */
  conferenceName: string;
  /** Conference year as a number */
  conferenceYear: number;
  /** Location/venue of the conference */
  conferenceLocation?: string;
  /** URL to the conference website */
  conferenceUri?: string;
  /** External identifier if available */
  conferenceIdentifier?: string;
  /** Type of external identifier (e.g., "doi", "isbn") */
  conferenceIdentifierType?: string;
  /** URI to conference schema definition */
  conferenceSchemaUri?: string;
  /** Conference start date in ISO 8601 format */
  conferenceStartDate?: string;
  /** Conference end date in ISO 8601 format */
  conferenceEndDate?: string;
  /** Conference acronym (e.g., "ICML", "NeurIPS") */
  conferenceAcronym?: string;
  /** Conference series name (e.g., "ICML 2024") */
  conferenceSeries?: string;
  /** Source of the record (e.g., "wikicfp", "easychair") */
  _source?: string;
}

/**
 * Represents the complete conference database with metadata and postings.
 */
export interface ConferenceDatabase {
  /** Metadata about the database */
  metadata: {
    /** Timestamp of last update */
    lastUpdated: string;
    /** Total number of conference records */
    totalPostings: number;
    /** List of data sources included in this database */
    sources: string[];
  };
  /** Array of conference records */
  postings: CollectedConference[];
}
