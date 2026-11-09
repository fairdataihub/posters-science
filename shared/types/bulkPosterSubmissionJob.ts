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
  wizardStep: BulkImportWizardStep | "assets" | "metadata";
  status: BulkPosterSubmissionJobStatus;
  /** Posters uploaded to Bunny under this job (before extraction). */
  stagedPosters: BulkImportStagedPoster[];
  licenseMetadataFileName: string | null;
  licenseMetadataFilePath: string | null;
  /** @deprecated Bulk v1 uses staged posters instead of a ZIP bundle. */
  zipFileName: string | null;
  /** @deprecated Bulk v1 uses staged posters instead of a ZIP bundle. */
  zipFilePath: string | null;
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
  wizardStep?: BulkImportWizardStep | "assets" | "metadata";
  status?: BulkPosterSubmissionJobStatus;
  stagedPosters?: BulkImportStagedPoster[];
  licenseMetadataFileName?: string | null;
  licenseMetadataFilePath?: string | null;
  zipFileName?: string | null;
  zipFilePath?: string | null;
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
