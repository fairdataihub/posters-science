import type { BulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";

/** Bulk import row included in `GET /api/poster` (in-progress only). */
export type DashboardBulkSubmission = {
  id: string;
  name: string;
  wizardStep: string;
  status: string;
  extractionMethod: BulkSubmissionExtractionMethod;
  posterCount: number | null;
  /** True when `status` is `processing` and at least one batch poster has a running extraction job. */
  hasActiveExtraction?: boolean;
  createdAt: string;
  updatedAt: string;
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
  /** Posters (non-published) and bulk imports interleaved, newest first. */
  inProgressFeed: DashboardInProgressFeedEntry[];
};
