import type { BulkImportWizardStep } from "#shared/types/bulkImportWizard";

/** Persisted bulk import batch (matches a future Prisma model). */
export type BulkPosterSubmissionJobStatus =
  | "draft"
  | "processing"
  | "completed"
  | "failed";

export type BulkImportStagedPoster = {
  fileName: string;
  filePath: string;
  uploadedAt: string;
  posterId?: number;
};

export type BulkPosterSubmissionJob = {
  id: string;
  userId: string;
  name: string;
  wizardStep: BulkImportWizardStep;
  status: BulkPosterSubmissionJobStatus;
  /** Posters uploaded to Bunny under this job (before extraction). */
  stagedPosters: BulkImportStagedPoster[];
  posterCount: number | null;
  submissionSummary: unknown | null;
  error: string | null;
  managedConferenceId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CreateBulkPosterSubmissionJobBody = {
  name: string;
  managedConferenceId?: string;
};

export type UpdateBulkPosterSubmissionJobBody = {
  name?: string;
  wizardStep?: BulkImportWizardStep;
  status?: BulkPosterSubmissionJobStatus;
  stagedPosters?: BulkImportStagedPoster[];
  posterCount?: number | null;
  submissionSummary?: unknown | null;
  error?: string | null;
  managedConferenceId?: string | null;
  completedAt?: string | null;
};

/** One extraction job's status, as returned by the bulk extraction-status endpoint. */
export type BulkImportExtractionJobStatus = {
  jobId: string;
  posterId: number;
  status: string;
  completed: boolean;
  error: string | null;
  imageUrl: string | null;
};

export type BulkImportExtractionStatusResponse = {
  jobs: BulkImportExtractionJobStatus[];
};
