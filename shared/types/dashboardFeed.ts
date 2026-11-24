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
  /** Set while the batch, or some of its posters, are on a worksheet hold. */
  hold?: {
    kind: "unsupported_platform" | "worksheet_error" | "posters";
    platform: string | null;
    posterCount: number;
  } | null;
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
