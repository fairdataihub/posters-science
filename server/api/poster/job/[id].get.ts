export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { user } = session;

  const jobId = getRouterParam(event, "id");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job ID is required",
    });
  }

  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Job not found",
    });
  }

  // Ensure the job belongs to the current user
  if (job.userId !== user.id) {
    throw createError({
      statusCode: 403,
      statusMessage: "Access denied",
    });
  }

  return {
    jobId: job.id,
    status: job.status,
    posterId: job.posterId,
    error: job.error,
    created: job.created,
    updated: job.updated,
  };
});
