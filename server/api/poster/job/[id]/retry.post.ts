export default defineEventHandler(async (event) => {
  // FEATURE FLAG (versioning)
  assertVersioningEnabled();

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
      poster: {
        select: {
          status: true,
          versionRootId: true,
          posterMetadata: { select: { posterId: true } },
        },
      },
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

  // Re-queue only the work that is actually missing. A draft that copied its
  // metadata has nothing to extract, and re-running extraction would overwrite
  // the fields the user is about to edit.
  const nextStatus = job.poster.posterMetadata
    ? "pending-thumbnail"
    : "pending-extraction";

  const pending = await prisma.extractionJob.update({
    where: { id: job.id },
    data: { status: nextStatus, completed: false, error: null },
    select: { status: true, completed: true, error: true },
  });

  // The worker polls this database, so the job is already on its way. Waking it
  // only skips the wait until the next poll, and a failed wake is not a failed
  // retry.
  if (config.posterExtractionApi) {
    setImmediate(async () => {
      try {
        await fetch(`${config.posterExtractionApi}/jobs/check`, {
          method: "POST",
        });
      } catch (error) {
        console.error(
          `[poster/job/retry] Could not wake the worker for job ${job.id}; it will be picked up on the next poll`,
          error,
        );
      }
    });
  }

  return pending;
});
