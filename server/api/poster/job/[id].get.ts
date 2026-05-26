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

  const job = await prisma.extractionJob.findFirst({
    where: { id: jobId, poster: { userId: user.id } },
  });

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Job not found",
    });
  }

  // Inject the default posters.science related identifier once extraction completes,
  // before the user ever sees the form. The UI navigates away after this, so this
  // runs once; if the user later removes the entry via PUT it stays gone.
  if (job.completed && job.posterId) {
    const config = useRuntimeConfig(event);
    const siteEnv = config.siteEnv || config.public.siteEnv;
    const baseUrl =
      siteEnv === "staging"
        ? "https://sandbox.posters.science"
        : "https://posters.science";

    const meta = await prisma.posterMetadata.findUnique({
      where: { posterId: job.posterId },
      select: { relatedIdentifiers: true },
    });

    if (meta) {
      const existing = Array.isArray(meta.relatedIdentifiers)
        ? (meta.relatedIdentifiers as Array<{ relatedIdentifier?: string }>)
        : [];
      const alreadyPresent = existing.some(
        (r) => r.relatedIdentifier === `${baseUrl}/discover/${job.posterId}`,
      );

      if (!alreadyPresent) {
        await prisma.posterMetadata.update({
          where: { posterId: job.posterId },
          data: {
            relatedIdentifiers: [
              ...existing,
              {
                relatedIdentifier: `${baseUrl}/discover/${job.posterId}`,
                relatedIdentifierType: "URL",
                relationType: "IsDescribedBy",
                resourceTypeGeneral: "Other",
              },
            ] as never,
          },
        });
      }
    }
  }

  return {
    jobId: job.id,
    status: job.status,
    completed: job.completed,
    posterId: job.posterId,
    error: job.error,
  };
});
