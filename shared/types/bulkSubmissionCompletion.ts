export type BulkSubmissionCompletionPoster = {
  posterId: number;
  rootPosterId: number;
  title: string;
  fileName: string;
  doi: string | null;
  zenodoUrl: string | null;
  discoverUrl: string | null;
};

export type BulkSubmissionCompletionResponse = {
  jobId: string;
  name: string;
  completedAt: string | null;
  zenodoBatchCompletedAt: string | null;
  posters: BulkSubmissionCompletionPoster[];
  allPublishedOnPlatform: boolean;
};
