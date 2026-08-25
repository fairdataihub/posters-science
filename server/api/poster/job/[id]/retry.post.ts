export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { id: jobId } = event.context.params as { id: string };

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job ID is required",
    });
  }

  const job = await prisma.extractionJob.findFirst({
    where: { id: jobId, poster: { userId: session.user.id } },
    select: {
      id: true,
      status: true,
      poster: { select: { status: true, versionRootId: true } },
    },
  });

  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Job not found" });
  }
  if (!job.poster.versionRootId || job.poster.status === "published") {
    throw createError({
      statusCode: 400,
      statusMessage: "Only unpublished poster versions can be retried",
    });
  }
  if (job.status !== "failed") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only failed extraction jobs can be retried",
    });
  }

  const config = useRuntimeConfig(event);
  if (!config.posterExtractionApi) {
    throw createError({
      statusCode: 503,
      statusMessage: "Poster extraction is not configured",
    });
  }

  const pending = await prisma.extractionJob.update({
    where: { id: job.id },
    data: { status: "pending-extraction", completed: false, error: null },
    select: { status: true, completed: true, error: true },
  });

  try {
    const response = await fetch(`${config.posterExtractionApi}/jobs/check`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Extraction service returned ${response.status}`);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? `Could not restart extraction: ${error.message}`
        : "Could not restart extraction";

    await prisma.extractionJob.update({
      where: { id: job.id },
      data: { status: "failed", completed: false, error: message },
    });

    throw createError({ statusCode: 502, statusMessage: message });
  }

  return pending;
});
