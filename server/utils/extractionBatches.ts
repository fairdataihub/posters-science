import { batchCounts } from "#shared/utils/extractionBatch";

export const batchJobSelect = {
  id: true,
  posterId: true,
  batchIndex: true,
  fileName: true,
  status: true,
  completed: true,
  fileUploaded: true,
  error: true,
} as const;

export async function getOwnedBatch(batchId: string, userId: string) {
  const batch = await prisma.extractionBatch.findFirst({
    where: { id: batchId, userId },
    include: {
      jobs: { select: batchJobSelect, orderBy: { batchIndex: "asc" } },
    },
  });

  if (!batch)
    throw createError({ statusCode: 404, statusMessage: "Batch not found" });

  return {
    id: batch.id,
    name: batch.name,
    created: batch.created,
    counts: batchCounts(batch.jobs, batch.totalFiles),
    jobs: batch.jobs,
  };
}
