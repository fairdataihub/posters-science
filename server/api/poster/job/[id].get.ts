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

    const versionPoster = await prisma.poster.findUnique({
      where: { id: job.posterId },
      select: { id: true, versionRootId: true, versionSequence: true },
    });
    const rootPosterId = versionPoster
      ? posterFamilyRootId(versionPoster)
      : job.posterId;
    const previousVersion = versionPoster?.versionRootId
      ? await prisma.poster.findFirst({
          where: {
            status: "published",
            versionSequence: { lt: versionPoster.versionSequence },
            ...posterFamilyWhere(rootPosterId),
          },
          orderBy: { versionSequence: "desc" },
          select: { posterMetadata: { select: { doi: true } } },
        })
      : null;
    const meta = await prisma.posterMetadata.findUnique({
      where: { posterId: job.posterId },
      select: { relatedIdentifiers: true, version: true },
    });

    if (meta) {
      const existing = Array.isArray(meta.relatedIdentifiers)
        ? (meta.relatedIdentifiers as Array<{
            relatedIdentifier?: string;
            relatedIdentifierType?: string;
            relationType?: string;
            resourceTypeGeneral?: string;
          }>)
        : [];
      const canonicalUrl = `${baseUrl}/discover/${rootPosterId}`;
      const alreadyPresent = existing.some(
        (r) => r.relatedIdentifier === canonicalUrl,
      );
      const previousDoi = previousVersion?.posterMetadata?.doi;
      const hasPreviousVersion = previousDoi
        ? existing.some(
            (r) =>
              r.relatedIdentifier?.toLowerCase() ===
                previousDoi.toLowerCase() &&
              r.relationType === "IsNewVersionOf",
          )
        : true;
      const relatedIdentifiers = [...existing];
      const assignedVersion = versionPoster?.versionRootId
        ? posterVersionLabel(versionPoster.versionSequence)
        : null;

      if (!alreadyPresent) {
        relatedIdentifiers.push({
          relatedIdentifier: canonicalUrl,
          relatedIdentifierType: "URL",
          relationType: "IsDescribedBy",
        });
      }
      if (previousDoi && !hasPreviousVersion) {
        relatedIdentifiers.push({
          relatedIdentifier: previousDoi,
          relatedIdentifierType: "DOI",
          relationType: "IsNewVersionOf",
        });
      }

      if (
        !alreadyPresent ||
        !hasPreviousVersion ||
        (assignedVersion && meta.version !== assignedVersion)
      ) {
        await prisma.posterMetadata.update({
          where: { posterId: job.posterId },
          data: {
            relatedIdentifiers: relatedIdentifiers as never,
            ...(assignedVersion && { version: assignedVersion }),
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
