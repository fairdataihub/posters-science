export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { user } = session;

  const { id: jobId } = event.context.params as { id: string };

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job ID is required",
    });
  }

  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId, poster: { userId: user.id } },
  });

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Job not found",
    });
  }

  return {
    jobId: job.id,
    status: job.status,
    completed: job.completed,
    posterId: job.posterId,
    error: job.error,
  };
});
