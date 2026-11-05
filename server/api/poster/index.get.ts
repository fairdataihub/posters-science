import {
  bulkSubmissionHasActiveExtraction,
  posterIdsFromBulkSubmissionSummary,
  posterIdsHiddenByInProgressBulkBatches,
  posterIdsHiddenFromBulkDashboard,
  posterIdsWithActiveExtractionJob,
  repairDownloadedPostersInActiveBulkBatches,
  splitBulkSubmissionsForDashboard,
} from "~~/server/utils/bulkImportDashboard";
import { tryCompleteBulkBatchIfReady } from "~~/server/utils/bulkImportZenodoBatchCompletion";

import {
  posterCountsAsDashboardInProgress,
  resolvePosterZenodoFilesEmbargoUntil,
} from "~~/server/utils/posterZenodoFilesEmbargo";

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
      fileUploaded: true,
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
      filesEmbargoUntil: true,
    },
  },
} as const;

const bulkDashboardSelect = {
  id: true,
  name: true,
  wizardStep: true,
  status: true,
  extractionMethod: true,
  posterCount: true,
  submissionSummary: true,
  created: true,
  updated: true,
  completedAt: true,
} as const;

async function loadBulkDashboardRows(userId: string) {
  const allRows = await prisma.bulkSubmission.findMany({
    where: { userId },
    orderBy: { updated: "desc" },
    select: bulkDashboardSelect,
  });

  const { inProgress, completed } = await splitBulkSubmissionsForDashboard(
    userId,
    allRows,
  );

  await repairDownloadedPostersInActiveBulkBatches(userId, inProgress);

  return {
    bulkSubmissionRows: inProgress,
    completedBulkSubmissionRows: completed,
  };
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  let { bulkSubmissionRows, completedBulkSubmissionRows } =
    await loadBulkDashboardRows(userId);

  let bulkCompletionChanged = false;
  for (const bulk of bulkSubmissionRows) {
    if (bulk.status !== "processing") continue;
    const { markedComplete } = await tryCompleteBulkBatchIfReady(
      userId,
      bulk.id,
    );
    if (markedComplete) bulkCompletionChanged = true;
  }
  if (bulkCompletionChanged) {
    ({ bulkSubmissionRows, completedBulkSubmissionRows } =
      await loadBulkDashboardRows(userId));
  }

  const posterRows = await prisma.poster.findMany({
    include: posterInclude,
    where: {
      userId,
      NOT: { extractionJob: { is: { status: "staged" } } },
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

  const zenodoFilesEmbargoUntilByPosterId = new Map<number, string | null>();
  await Promise.all(
    posterRows.map(async (poster) => {
      const until = await resolvePosterZenodoFilesEmbargoUntil(poster, userId);
      zenodoFilesEmbargoUntilByPosterId.set(poster.id, until);
    }),
  );

  const owned = posterRows.map((poster) => {
    const rootPosterId = posterFamilyRootId(poster);
    const details = familyDetails.get(rootPosterId)!;
    const isLatestPublished = details.latestPublishedId === poster.id;

    return {
      ...poster,
      rootPosterId,
      versionCount: details.publishedCount,
      isLatestPublished,
      zenodoFilesEmbargoUntil:
        zenodoFilesEmbargoUntilByPosterId.get(poster.id) ?? null,
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

  const posters = [...owned, ...claimed].sort(
    (a, b) => activity(b) - activity(a),
  );

  const bulkPosterIds = [
    ...new Set(
      bulkSubmissionRows.flatMap((bulk) =>
        posterIdsFromBulkSubmissionSummary(bulk.submissionSummary),
      ),
    ),
  ];
  const activeExtractionPosterIds =
    await posterIdsWithActiveExtractionJob(bulkPosterIds);

  const mapBulkSubmissionRow = (
    bulk: (typeof bulkSubmissionRows)[number] & { completedAt?: Date | null },
  ) => ({
    id: bulk.id,
    name: bulk.name,
    wizardStep: bulk.wizardStep,
    status: bulk.status,
    extractionMethod: bulk.extractionMethod,
    posterCount: bulk.posterCount,
    hasActiveExtraction:
      bulk.status === "processing" &&
      bulkSubmissionHasActiveExtraction(
        bulk.submissionSummary,
        activeExtractionPosterIds,
      ),
    createdAt: bulk.created.toISOString(),
    updatedAt: bulk.updated.toISOString(),
    completedAt: bulk.completedAt?.toISOString() ?? null,
  });

  const bulkSubmissions = bulkSubmissionRows.map(mapBulkSubmissionRow);

  const completedBulkSubmissions = completedBulkSubmissionRows.map(
    mapBulkSubmissionRow,
  );

  const bulkHiddenPosterIds = await posterIdsHiddenFromBulkDashboard(
    userId,
    bulkSubmissionRows,
    completedBulkSubmissionRows,
  );

  const activeBulkManagedPosterIds = [
    ...posterIdsHiddenByInProgressBulkBatches(bulkSubmissionRows),
  ];

  const inProgressFeed = [
    ...owned
      .filter(
        (poster) =>
          posterCountsAsDashboardInProgress(
            poster.status,
            poster.zenodoFilesEmbargoUntil,
          ) && !bulkHiddenPosterIds.has(poster.id),
      )
      .map((poster) => ({
        type: "poster" as const,
        posterId: poster.id,
        updatedAt:
          poster.updated instanceof Date
            ? poster.updated.toISOString()
            : String(poster.updated),
      })),
    ...bulkSubmissions.map((bulk) => ({
      type: "bulkSubmission" as const,
      bulkSubmissionId: bulk.id,
      updatedAt: bulk.updatedAt,
    })),
  ].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return {
    posters,
    bulkSubmissions,
    completedBulkSubmissions,
    inProgressFeed,
    activeBulkManagedPosterIds,
  };
});

/**
 * Auto-indexed posters the user claimed as an author, each as its latest
 * published version and shaped like an owned published poster so the
 * dashboard can list them together. Retired posters are included and show as
 * tombstoned, like the user's own. Only the team can restore them.
 */
async function loadClaimedPosters(userId: string) {
  const claims = await prisma.posterClaim.findMany({
    where: { userId },
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
    zenodoFilesEmbargoUntil: null as string | null,
    activeVersionDraft: null,
    claimed: true,
    claimedAt: claimedAt.get(rootPosterId) ?? null,
  }));
}
