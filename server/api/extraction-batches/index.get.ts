import { batchCounts } from "#shared/utils/extractionBatch";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  // History remains accessible when new bulk submissions are disabled.
  const requestedPage = Number(getQuery(event).page || 1);
  const page = Number.isInteger(requestedPage)
    ? Math.min(10000, Math.max(1, requestedPage))
    : 1;
  const where = { userId: session.user.id };
  const [batches, total] = await prisma.$transaction([
    prisma.extractionBatch.findMany({
      where,
      orderBy: [{ created: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
      include: { jobs: { select: { status: true, fileUploaded: true } } },
    }),
    prisma.extractionBatch.count({ where }),
  ]);

  return {
    page,
    total,
    batches: batches.map((batch) => ({
      id: batch.id,
      name: batch.name,
      created: batch.created,
      counts: batchCounts(batch.jobs, batch.totalFiles),
    })),
  };
});
