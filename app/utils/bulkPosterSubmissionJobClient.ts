import type {
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

export type BulkPosterSubmissionUploadRole = "poster" | "license_metadata";

export async function uploadBulkPosterSubmissionFile(
  jobId: string,
  file: File,
  role: BulkPosterSubmissionUploadRole,
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("role", role);

  return $fetch<{
    role: BulkPosterSubmissionUploadRole;
    fileName: string;
    filePath: string;
    job: BulkPosterSubmissionJob;
  }>(`/api/bulk-poster-submissions/${jobId}/upload`, {
    method: "POST",
    body: formData,
  });
}
