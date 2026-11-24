import type { BulkSubmissionCollectionLink } from "./dashboardFeed";

export type BulkSubmissionCompletionPoster = {
  posterId: number;
  rootPosterId: number;
  title: string;
  fileName: string;
  doi: string | null;
  zenodoUrl: string | null;
  discoverUrl: string | null;
  filesEmbargoUntil: string | null;
  filesEmbargoActive: boolean;
};

export type BulkSubmissionCompletionResponse = {
  jobId: string;
  name: string;
  completedAt: string | null;
  zenodoBatchCompletedAt: string | null;
  posters: BulkSubmissionCompletionPoster[];
  allPublishedOnPlatform: boolean;
  /** True when every poster is on Zenodo but at least one file embargo is still active. */
  awaitingEmbargoRelease: boolean;
  activeEmbargoCount: number;
  latestActiveEmbargoUntil: string | null;
  /** False when embargo dates were not persisted from Zenodo publish — early release is hidden. */
  fileEmbargoEarlyReleaseReady: boolean;
  /** Set once a collection was made from this upload. */
  collection: BulkSubmissionCollectionLink | null;
};

/** One of the person's organizations, for showing a whole batch on its page. */
export type BulkBatchOrganization = {
  id: string;
  name: string;
  path: string;
  avatarUrl: string;
  isPublic: boolean;
  hidden: boolean;
  /** How many of the batch's posters this organization already shows. */
  listedCount: number;
};

export type BulkBatchOrganizations = {
  /** Version roots of the batch's posters that can go on an organization page. */
  posterIds: number[];
  /** The batch's posters that can't be listed yet, such as unpublished ones. */
  skippedCount: number;
  organizations: BulkBatchOrganization[];
};

export type BulkReleaseFileEmbargoResponse = {
  released: number;
  failed: number;
  failures: { posterId: number; error: string }[];
};
