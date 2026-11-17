/**
 * Where the iD used for suggestions came from: linked through ORCID sign-in
 * (ORCID confirmed it) or typed on the settings page.
 */
export type OrcidSource = "linked" | "typed";

/** The iD posters are matched against, or null when the user has none. */
export type MatchingOrcid = {
  orcid: string | null;
  source: OrcidSource | null;
};

/** An auto-indexed poster whose author list includes the user's iD. */
export type OrcidSuggestion = {
  /** The version root, which is what a claim is stored against. */
  posterId: number;
  /** The latest public version, for links to the poster page. */
  versionId: number;
  title: string;
  imageUrl: string;
  publicationYear: number | null;
  /** Acronym or name, plus the year when known. */
  conference: string | null;
  doi: string | null;
  /** The author name the record puts next to the iD. */
  listedAs: string | null;
};

export type OrcidSuggestions = MatchingOrcid & {
  /** The user hid the dashboard panel. */
  hidden: boolean;
  /** Posters the user marked "Not me". */
  dismissedCount: number;
  /** Every current suggestion, including ones past the list limit. */
  total: number;
  /** Newest first. Empty while hidden. */
  suggestions: OrcidSuggestion[];
};
