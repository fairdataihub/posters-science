export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  await assertNotInMaintenance("extraction");
  const id = getRouterParam(event, "jobId")!;
  const job = await prisma.extractionJob.findFirst({
    where: {
      id,
      batchId: getRouterParam(event, "id")!,
      batch: { userId: session.user.id },
      poster: { userId: session.user.id, status: "draft" },
    },
    include: {
      poster: { select: { posterMetadata: { select: { posterId: true } } } },
    },
  });
  if (!job)
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  if (!job.fileUploaded)
    throw createError({
      statusCode: 409,
      statusMessage: "Select the file again to retry its upload",
    });

  const status = nextExtractionStatus(Boolean(job.poster.posterMetadata));
  const updated = await prisma.extractionJob.updateMany({
    where: { id, status: "failed", completed: true, fileUploaded: true },
    data: { status, completed: false, error: null },
  });
  if (!updated.count)
    throw createError({
      statusCode: 409,
      statusMessage: "Only failed jobs can be retried",
    });
  // batchId and queueClass are deliberately preserved.
  wakeExtractionWorker(id, "batch/retry");

  return { jobId: id, status };
});
