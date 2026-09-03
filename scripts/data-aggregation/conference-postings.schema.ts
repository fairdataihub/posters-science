/**
 * Conference Postings JSON Schema
 *
 * This file documents the structure of conference-postings.json,
 * which serves as a temporary database for scraped conference postings.
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
  id?: string; // Optional: unique identifier (cuid or UUID)
  title: string; // Conference name/title
  url: string; // Link to conference posting
  deadline: string; // Submission deadline (ISO 8601 or human-readable)
  conferenceDate: string; // When the conference takes place
  location: string; // Physical location or "Virtual"
  acronym?: string; // Optional: conference acronym (e.g., "ICML")
  description?: string; // Optional: additional details (notification dates, etc.)
  submissionLink?: string; // Optional: direct link to submission portal
  source?: string; // Source: "wikicfp" | "acm" | "ieee" | etc.
  dateExtracted?: string; // When this posting was scraped (ISO 8601)
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
 *       "id": "clv1234567890abc",
 *       "title": "ICML 2025 - International Conference on Machine Learning",
 *       "url": "https://icml.cc/",
 *       "deadline": "2025-01-15",
 *       "conferenceDate": "2025-07-15 - 2025-07-21",
 *       "location": "Denver, CO, USA",
 *       "acronym": "ICML",
 *       "description": "Notification: 2025-03-15",
 *       "submissionLink": "https://icml.cc/submissions/",
 *       "source": "wikicfp",
 *       "dateExtracted": "2026-09-03T14:30:00Z"
 *     }
 *   ]
 * }
 */
