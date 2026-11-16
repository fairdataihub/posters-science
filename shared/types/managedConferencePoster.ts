export type ConferencePosterListStatus = "submitted" | "in_progress";

export type ConferencePosterSubmissionKind = "individual" | "bulk";

export type ConferencePosterWorkflowStage =
  | "queued"
  | "extracting"
  | "review_metadata"
  | "import_processing"
  | "failed";

export type ManagedConferencePoster = {
  id: string;
  title: string;
  submitterName: string;
  license: string | null;
  submittedAt: string | null;
  thumbnailUrl: string | null;
  status: ConferencePosterListStatus;
  submissionKind: ConferencePosterSubmissionKind;
  workflowStage?: ConferencePosterWorkflowStage;
  /** Set for bulk imports still processing. */
  posterCount?: number;
  updatedAt: string;
};
