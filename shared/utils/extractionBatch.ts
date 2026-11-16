import { z } from "zod";
import { posterFileRejectionReason } from "./posterFile.ts";

export const batchManifestSchema = z.object({
  requestKey: z.uuid(),
  name: z.string().trim().min(1).max(100),
  files: z
    .array(
      z
        .object({
          name: z.string().min(1).max(200),
          type: z.string().max(100),
          size: z.number().int().positive(),
        })
        .superRefine((file, ctx) => {
          const reason = posterFileRejectionReason(file);

          if (reason) ctx.addIssue({ code: "custom", message: reason });
        }),
    )
    .min(1),
});

export type BatchJob = {
  id: string;
  posterId: number;
  batchIndex: number | null;
  fileName: string;
  status: string;
  completed: boolean;
  fileUploaded: boolean;
  error: string | null;
};

export function batchCounts(
  jobs: Pick<BatchJob, "status" | "fileUploaded">[],
  total: number,
) {
  const counts = {
    total,
    completed: 0,
    failed: 0,
    queued: 0,
    processing: 0,
    uploading: 0,
    removed: Math.max(0, total - jobs.length),
  };

  for (const job of jobs) {
    if (job.status === "completed") counts.completed++;
    else if (job.status === "failed") counts.failed++;
    else if (!job.fileUploaded) counts.uploading++;
    else if (job.status === "processing") counts.processing++;
    else counts.queued++;
  }

  return counts;
}

export type BatchCounts = ReturnType<typeof batchCounts>;
export type BatchSummary = {
  id: string;
  name: string;
  created: string;
  counts: BatchCounts;
};
export type BatchDetail = BatchSummary & { jobs: BatchJob[] };
