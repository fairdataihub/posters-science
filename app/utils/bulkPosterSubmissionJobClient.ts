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
  return $fetch<{ success: true; keptPublishedPosterCount: number }>(
    `/api/bulk-poster-submissions/${jobId}`,
    {
      method: "DELETE",
    },
  );
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

export type BulkPosterSubmissionUploadResponse = {
  role: "poster";
  fileName: string;
  filePath: string;
  job: BulkPosterSubmissionJob;
};

function xhrUploadErrorMessage(xhr: XMLHttpRequest): string {
  try {
    const json = JSON.parse(xhr.responseText) as {
      statusMessage?: string;
      message?: string;
    };
    return json.statusMessage ?? json.message ?? `Request failed (${xhr.status})`;
  } catch {
    const text = xhr.responseText?.trim();
    return text ? text.slice(0, 120) : `Request failed (${xhr.status})`;
  }
}

export async function uploadBulkPosterSubmissionFile(
  jobId: string,
  file: File,
  options?: {
    onUploadProgress?: (percent: number) => void;
  },
): Promise<BulkPosterSubmissionUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("role", "poster");

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/bulk-poster-submissions/${jobId}/upload`);
    xhr.withCredentials = true;

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      options?.onUploadProgress?.(percent);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as BulkPosterSubmissionUploadResponse);
        } catch {
          reject(new Error("Upload succeeded but the response was invalid."));
        }
        return;
      }

      reject(new Error(xhrUploadErrorMessage(xhr)));
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed due to a network error."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload was cancelled."));
    });

    xhr.send(formData);
  });
}
