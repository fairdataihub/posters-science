const posterInclude = {
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
      // The dashboard shows how long a draft has been preparing, so the
      // panel can report elapsed time without waiting for its first poll.
      created: true,
      updated: true,
    },
  },
  zenodoDepositions: {
    select: {
      depositionId: true,
      status: true,
      lastPublishedZenodoDoi: true,
    },
  },
} as const;

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  const posterRows = await prisma.poster.findMany({
    include: posterInclude,
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

  const owned = posterRows.map((poster) => {
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
      claimed: false,
      claimedAt: null as Date | null,
    };
  });

  const claimed = await loadClaimedPosters(userId);

  // Claimed posters sit among the user's own published posters, placed by
  // when they were claimed rather than when the record was last imported.
  const activity = (poster: { claimedAt: Date | null; updated: Date }) =>
    (poster.claimedAt ?? poster.updated).getTime();

  return [...owned, ...claimed].sort((a, b) => activity(b) - activity(a));
});

/**
 * Auto-indexed posters the user claimed as an author, each as its latest
 * published version and shaped like an owned published poster so the
 * dashboard can list them together. Retired posters are left out.
 */
async function loadClaimedPosters(userId: string) {
  const claims = await prisma.posterClaim.findMany({
    where: { userId, poster: { tombstone: false } },
    select: { posterId: true, created: true },
  });

  if (claims.length === 0) return [];

  const claimedAt = new Map(
    claims.map((claim) => [claim.posterId, claim.created]),
  );
  const rootIds = [...claimedAt.keys()];

  const versions = await prisma.poster.findMany({
    include: posterInclude,
    where: {
      status: "published",
      tombstone: false,
      isLatestVersion: true,
      // Never list a poster the user already owns twice.
      NOT: { userId },
      OR: [{ id: { in: rootIds } }, { versionRootId: { in: rootIds } }],
    },
    orderBy: { versionSequence: "desc" },
  });

  const latestByRoot = new Map<number, (typeof versions)[number]>();

  for (const version of versions) {
    const rootId = posterFamilyRootId(version);

    // Ordered by sequence, so the first one seen is the newest.
    if (!latestByRoot.has(rootId)) latestByRoot.set(rootId, version);
  }

  return [...latestByRoot.entries()].map(([rootPosterId, poster]) => ({
    ...poster,
    rootPosterId,
    versionCount: 1,
    isLatestPublished: true,
    activeVersionDraft: null,
    claimed: true,
    claimedAt: claimedAt.get(rootPosterId) ?? null,
  }));
}
