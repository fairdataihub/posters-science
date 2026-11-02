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
};

export type BulkReleaseFileEmbargoResponse = {
  released: number;
  failed: number;
  failures: { posterId: number; error: string }[];
};
