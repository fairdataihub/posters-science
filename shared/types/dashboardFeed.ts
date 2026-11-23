/** The collection made from a bulk upload, if any. */
export type BulkSubmissionCollectionLink = {
  id: string;
  path: string;
  name: string;
};

/** Bulk import row included in `GET /api/poster` (in-progress only). */
export type DashboardBulkSubmission = {
  id: string;
  name: string;
  wizardStep: string;
  status: string;
  posterCount: number | null;
  /** True when `status` is `processing` and at least one batch poster has a running extraction job. */
  hasActiveExtraction?: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  /** Set once a collection was made from this upload. */
  collection?: BulkSubmissionCollectionLink | null;
};

export type DashboardInProgressFeedEntry =
  | {
      type: "poster";
      posterId: number;
      updatedAt: string;
    }
  | {
      type: "bulkSubmission";
      bulkSubmissionId: string;
      updatedAt: string;
    };

export type DashboardPosterFeedResponse = {
  posters: unknown[];
  bulkSubmissions: DashboardBulkSubmission[];
  /** Bulk imports finished on Zenodo (all batch posters published). */
  completedBulkSubmissions?: DashboardBulkSubmission[];
  /** Posters (non-published) and bulk imports interleaved, newest first. */
  inProgressFeed: DashboardInProgressFeedEntry[];
  /** Poster IDs still managed by an open bulk job (hide duplicate published cards). */
  activeBulkManagedPosterIds?: number[];
};

/** Where a published poster is archived, for the dashboard's filters. */
export type PosterRepository = "zenodo" | "figshare" | "other";

/**
 * `GET /api/user/dashboard-search`: what in the user's Published list matches
 * a Discover-style search. Both are null when there is no search.
 */
export type DashboardSearchMatches = {
  /** Version roots of the matching posters. */
  rootIds: number[] | null;
  /** Bulk uploads whose name holds the search's free text. */
  bulkSubmissionIds: string[] | null;
};
