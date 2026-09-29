export default defineEventHandler(async (event) => {
  const session = await requireAdminSession(event);

  await assertNotInMaintenance("extraction");

  const { id: jobId } = event.context.params as { id: string };

  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "Job ID is required" });
  }

  // Unlike the owner facing retry this is not limited to failed jobs on
  // unpublished versions: an admin may need to re-run a stuck job too.
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      poster: {
        select: { id: true, posterMetadata: { select: { posterId: true } } },
      },
    },
  });

  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Job not found" });
  }

  const pending = await requeueExtractionJob(
    job.id,
    Boolean(job.poster.posterMetadata),
    "admin/extraction-jobs/retry",
  );

  await logAdminAction({
    adminUserId: session.user.id,
    action: "RETRY_EXTRACTION_JOB",
    entityType: "extractionJob",
    entityId: job.id,
    details: {
      posterId: job.poster.id,
      previousStatus: job.status,
      nextStatus: pending.status,
    },
  });

  return pending;
});
