export default defineEventHandler(async (event) => {
  // FEATURE FLAG (versioning)
  assertVersioningEnabled();

  const session = await requireUserSession(event);

  // Only the extraction switch applies here. The versioning switch pauses
  // starting a new version; this draft already exists, so letting the user
  // finish it is the point of "drafts in progress stay editable".
  await assertNotInMaintenance("extraction");

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

  const pending = await requeueExtractionJob(
    job.id,
    Boolean(job.poster.posterMetadata),
    "poster/job/retry",
  );

  return {
    status: pending.status,
    completed: pending.completed,
    error: pending.error,
  };
});
