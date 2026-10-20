import type {
  BulkImportStagedPoster,
  BulkPosterSubmissionJob,
  CreateBulkPosterSubmissionJobBody,
  UpdateBulkPosterSubmissionJobBody,
} from "#shared/types/bulkPosterSubmissionJob";

/** Client-side API for bulk jobs — keep components on these helpers, not raw paths. */
export async function listBulkPosterSubmissionJobs() {
  return $fetch<{ data: BulkPosterSubmissionJob[] }>(
    "/api/bulk-poster-submissions",
  );
}

export async function createBulkPosterSubmissionJob(
  body: CreateBulkPosterSubmissionJobBody,
) {
  return $fetch<BulkPosterSubmissionJob>("/api/bulk-poster-submissions", {
    method: "POST",
    body,
  });
}

export async function getBulkPosterSubmissionJob(jobId: string) {
  return $fetch<BulkPosterSubmissionJob>(
    `/api/bulk-poster-submissions/${jobId}`,
  );
}

/** Reconcile `stagedPosters` with objects under this job's Bunny prefix. */
export async function syncBulkStagedPostersFromStorage(jobId: string) {
  return $fetch<{
    stagedPosters: BulkImportStagedPoster[];
    syncedFromStorage: boolean;
  }>(`/api/bulk-poster-submissions/${jobId}/sync-staged`, {
    method: "POST",
  });
}

export async function updateBulkPosterSubmissionJob(
  jobId: string,
  body: UpdateBulkPosterSubmissionJobBody,
) {
  return $fetch<BulkPosterSubmissionJob>(
    `/api/bulk-poster-submissions/${jobId}`,
    {
      method: "PATCH",
      body,
    },
  );
}

export async function deleteBulkPosterSubmissionJob(jobId: string) {
  return $fetch<{ success: true }>(`/api/bulk-poster-submissions/${jobId}`, {
    method: "DELETE",
  });
}

export async function deleteBulkStagedPoster(jobId: string, filePath: string) {
  return $fetch<{ job: BulkPosterSubmissionJob }>(
    `/api/bulk-poster-submissions/${jobId}/staged-poster`,
    {
      method: "DELETE",
      body: { filePath },
    },
  );
}

export async function deleteAllBulkStagedPosters(jobId: string) {
  return $fetch<{ job: BulkPosterSubmissionJob; deletedCount: number }>(
    `/api/bulk-poster-submissions/${jobId}/staged-posters`,
    { method: "DELETE" },
  );
}

export type BulkPosterSubmissionSubmitResult = {
  job: BulkPosterSubmissionJob;
  posters: {
    posterId: number;
    extractionJobId: string;
    fileName: string;
  }[];
};

export async function applyBulkSubmissionMetadataToPosters(
  jobId: string,
  posterId?: number,
) {
  return $fetch<{ updatedPosterIds: number[] }>(
    `/api/bulk-poster-submissions/${jobId}/apply-metadata`,
    {
      method: "POST",
      body: posterId != null ? { posterId } : {},
    },
  );
}

export async function submitBulkPosterSubmissionJob(jobId: string) {
  return $fetch<BulkPosterSubmissionSubmitResult>(
    `/api/bulk-poster-submissions/${jobId}/submit`,
    { method: "POST" },
  );
}

export async function uploadBulkPosterSubmissionFile(jobId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("role", "poster");

  return $fetch<{
    role: "poster";
    fileName: string;
    filePath: string;
    job: BulkPosterSubmissionJob;
  }>(`/api/bulk-poster-submissions/${jobId}/upload`, {
    method: "POST",
    body: formData,
  });
}
