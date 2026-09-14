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

  const familyDetails = new Map<
    number,
    {
      latestPublishedId: number | null;
      publishedCount: number;
      activeVersionDraft: {
        id: number;
        versionSequence: number;
        imageUrl: string;
        title: string;
        description: string;
        extractionJob: (typeof posterRows)[number]["extractionJob"];
      } | null;
    }
  >();

  for (const [rootPosterId, family] of families.entries()) {
    const ordered = [...family].sort(
      (a, b) => b.versionSequence - a.versionSequence,
    );
    const latestPublished = ordered.find(
      (poster) => poster.status === "published",
    );
    const activeVersionDraft = ordered.find(
      (poster) => poster.id !== rootPosterId && poster.status !== "published",
    );

    familyDetails.set(rootPosterId, {
      latestPublishedId: latestPublished?.id ?? null,
      publishedCount: family.filter((poster) => poster.status === "published")
        .length,
      activeVersionDraft: activeVersionDraft
        ? {
            id: activeVersionDraft.id,
            versionSequence: activeVersionDraft.versionSequence,
            imageUrl: activeVersionDraft.imageUrl,
            title: activeVersionDraft.title,
            description: activeVersionDraft.description,
            extractionJob: activeVersionDraft.extractionJob,
          }
        : null,
    });
  }

  return posterRows.map((poster) => {
    const rootPosterId = posterFamilyRootId(poster);
    const details = familyDetails.get(rootPosterId)!;
    const isLatestPublished = details.latestPublishedId === poster.id;

    return {
      ...poster,
      rootPosterId,
      versionCount: details.publishedCount,
      isLatestPublished,
      // Only the latest published record owns the family-level edit action.
      // Drafts are returned separately so each dashboard card has one state.
      activeVersionDraft: isLatestPublished ? details.activeVersionDraft : null,
    };
  });
});
