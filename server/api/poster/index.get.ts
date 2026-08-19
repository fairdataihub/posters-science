export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  const posterRows = await prisma.poster.findMany({
    include: {
      posterMetadata: {
        select: {
          publisher: true,
          publicationYear: true,
          doi: true,
          license: true,
          version: true,
        },
      },
      extractionJob: {
        select: {
          id: true,
          status: true,
          completed: true,
          error: true,
        },
      },
      zenodoDepositions: {
        select: {
          depositionId: true,
          status: true,
          lastPublishedZenodoDoi: true,
        },
      },
    },
    where: {
      userId,
    },
    orderBy: {
      updated: "desc",
    },
  });

  const families = new Map<number, typeof posterRows>();

  for (const poster of posterRows) {
    const rootId = posterFamilyRootId(poster);
    const family = families.get(rootId) ?? [];
    family.push(poster);
    families.set(rootId, family);
  }

  return [...families.entries()].map(([rootPosterId, family]) => {
    const ordered = [...family].sort(
      (a, b) => b.versionSequence - a.versionSequence,
    );
    const latestPublished = ordered.find(
      (poster) => poster.status === "published",
    );
    const activeVersionDraft = ordered.find(
      (poster) => poster.id !== rootPosterId && poster.status !== "published",
    );
    const displayed = latestPublished ?? ordered[0]!;

    return {
      ...displayed,
      rootPosterId,
      versionCount: family.filter((poster) => poster.status === "published")
        .length,
      activeVersionDraft: activeVersionDraft
        ? {
            id: activeVersionDraft.id,
            versionSequence: activeVersionDraft.versionSequence,
            extractionJob: activeVersionDraft.extractionJob,
          }
        : null,
    };
  });
});
