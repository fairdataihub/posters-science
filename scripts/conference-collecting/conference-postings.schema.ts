/**
 * Conference Postings JSON Schema
 *
 * This file documents the structure of conference-postings.json,
 * which serves as a temporary database for collected conference postings.
 */

export interface ConferencePostingDB {
  metadata: {
    lastUpdated: string; // ISO 8601 timestamp
    totalPostings: number; // Count of postings
    sources: string[]; // List of data sources used
  };
  postings: ConferencePosting[];
}

export interface ConferencePosting {
  // Internal deduplication key (not in poster schema)
  id: string;

  // Required poster schema fields
  conferenceName: string;
  conferenceYear: number;

  // Optional poster schema fields
  conferenceAcronym?: string;
  conferenceStartDate?: string; // ISO 8601 format (YYYY-MM-DD)
  conferenceEndDate?: string; // ISO 8601 format (YYYY-MM-DD)
  conferenceLocation?: string;
  conferenceUri?: string;
  conferenceIdentifier?: string;
  conferenceIdentifierType?: string;
  conferenceSchemaUri?: string;
  conferenceSeries?: string;

  // Internal tracking
  _source?: string; // Collection source: "wikicfp", "easychair"
  _rawDate?: string; // Human-readable date (before parsing)
}

/**
 * Extracts only the poster schema fields from a ConferencePosting.
 * Removes internal fields (id, _source, _rawDate).
 */
export function toPostersSchemaConference(
  posting: ConferencePosting,
): Omit<ConferencePosting, "id" | "_source" | "_rawDate"> {
  const { id, _source, _rawDate, ...schemaFields } = posting;
  return schemaFields;
}

/**
 * Example structure:
 * {
 *   "metadata": {
 *     "lastUpdated": "2026-09-03T14:30:00Z",
 *     "totalPostings": 2,
 *     "sources": ["wikicfp", "acm"]
 *   },
 *   "postings": [
 *     {
 *       "id": "ICML:Jul 15, 2025 - Jul 21, 2025",
 *       "title": "ICML 2025 - International Conference on Machine Learning",
 *       "acronym": "ICML",
 *       "conferenceDate": "Jul 15, 2025 - Jul 21, 2025",
 *       "sources": [
 *         {
 *           "name": "wikicfp",
 *           "url": "https://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=123456"
 *         },
 *         {
 *           "name": "easychair",
 *           "url": "https://easychair.org/cfp/icml2025"
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
