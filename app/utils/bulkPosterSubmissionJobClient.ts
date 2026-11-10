import type {
  BulkImportExtractionStatusResponse,
  BulkImportStagedPoster,
  BulkPosterSubmissionJob,
  CreateBulkPosterSubmissionJobBody,
} from "#shared/types/bulkPosterSubmissionJob";
import type { UpdateBulkJobBody } from "~~/server/utils/bulkJobPatchBody";
import {
  posterUploadBaseName,
  posterUploadPathHint,
} from "#shared/utils/bulkPosterUploadFileName";

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

/** Status of every extraction job in this bulk import, in one request. */
export async function getBulkImportExtractionStatus(jobId: string) {
  return $fetch<BulkImportExtractionStatusResponse>(
    `/api/bulk-poster-submissions/${jobId}/extraction-status`,
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
  body: UpdateBulkJobBody,
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

export async function getBulkReviewMetadataGrid(
  jobId: string,
  options: { refresh?: boolean } = {},
) {
  return $fetch<import("#shared/types/bulkReviewMetadataGrid").BulkReviewMetadataGrid>(
    `/api/bulk-poster-submissions/${jobId}/metadata-grid`,
    { query: options.refresh ? { refresh: "1" } : undefined },
  );
}

/** Strict-form validation for every poster in the batch, in one request. */
/** One poster's preview status and required-field issues (Poster Previews). */
export type BulkPosterPreviewSummary = {
  posterId: number;
  found: boolean;
  imageUrl: string;
  status: string;
  extractionJob: { status: string; completed: boolean } | null;
  issues: Array<{ path: string; message: string }>;
};

/** Thumbnail / extraction status and validation for every poster, in one request. */
export async function getBulkPosterPreviewSummaries(jobId: string) {
  return $fetch<{ posters: BulkPosterPreviewSummary[] }>(
    `/api/bulk-poster-submissions/${jobId}/poster-summaries`,
  );
}

export async function getBulkReviewMetadataValidation(jobId: string) {
  return $fetch<{
    posters: Array<{
      posterId: number;
      issues: Array<{ path: string; message: string }>;
    }>;
  }>(`/api/bulk-poster-submissions/${jobId}/metadata-validation`);
}

export async function saveBulkReviewMetadataGrid(
  jobId: string,
  body: import("#shared/types/bulkReviewMetadataGrid").BulkReviewMetadataGridSaveBody,
) {
  return $fetch<import("#shared/types/bulkReviewWorkbookImport").BulkReviewWorkbookImportResult>(
    `/api/bulk-poster-submissions/${jobId}/metadata-grid`,
    { method: "POST", body },
  );
}

/** @deprecated Batch metadata is edited in-app via the metadata grid. */
export async function importBulkReviewMetadataWorkbook(
  jobId: string,
  file: File,
) {
  const formData = new FormData();
  formData.append("workbook", file, file.name);

  return $fetch<import("#shared/types/bulkReviewWorkbookImport").BulkReviewWorkbookImportResult>(
    `/api/bulk-poster-submissions/${jobId}/metadata-workbook`,
    {
      method: "POST",
      body: formData,
    },
  );
}

export async function submitBulkPosterSubmissionJob(jobId: string) {
  return $fetch<BulkPosterSubmissionSubmitResult>(
    `/api/bulk-poster-submissions/${jobId}/submit`,
    { method: "POST" },
  );
}

export type DiscardFailedBulkExtractionsResult = {
  job: BulkPosterSubmissionJob;
  removedCount: number;
  removedFileNames: string[];
};

export async function discardFailedBulkExtractions(jobId: string) {
  return $fetch<DiscardFailedBulkExtractionsResult>(
    `/api/bulk-poster-submissions/${jobId}/discard-failed`,
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
  const stagedFileName =
    file.name.includes("/") || file.name.includes("\\")
      ? posterUploadBaseName(posterUploadPathHint(file))
      : file.name;
  formData.append("file", file, stagedFileName);
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
