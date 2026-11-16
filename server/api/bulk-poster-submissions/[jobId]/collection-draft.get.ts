import type { CollectionDraft } from "#shared/types/collection";
import {
  COLLECTION_CONFERENCE_MAX,
  COLLECTION_NAME_MAX,
  COLLECTION_POSTER_MAX,
  collectionPath,
} from "#shared/utils/collection";
import { posterIdsFromBulkSubmissionSummary } from "~~/server/utils/bulkImportDashboard";

/**
 * Details for a new collection made from one of the person's bulk uploads:
 * its name, its conference, and the upload's posters that can go in a
 * collection now. Nothing is created until they confirm.
 */
export default defineEventHandler(async (event): Promise<CollectionDraft> => {
  const session = await requireDbUserSession(event);
  const userId = session.user.id;
  const jobId = getRouterParam(event, "jobId") ?? "";

  const job = await prisma.bulkSubmission.findFirst({
    where: { id: jobId, userId },
    select: {
      name: true,
      submissionSummary: true,
      collection: { select: { id: true, profileId: true, name: true } },
    },
  });

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk upload not found",
    });
  }

  const ids = posterIdsFromBulkSubmissionSummary(job.submissionSummary);

  const [posters, listable] = await Promise.all([
    ids.length === 0
      ? []
      : prisma.poster.findMany({
          where: { id: { in: ids }, userId },
          select: {
            id: true,
            versionRootId: true,
            posterMetadata: {
              select: {
                conferenceName: true,
                conferenceAcronym: true,
                conferenceYear: true,
              },
            },
          },
        }),
    listablePosterRoots(userId),
  ]);

  const rootIds = [...new Set(posters.map((p) => posterFamilyRootId(p)))];
  const posterIds = rootIds
    .filter((id) => listable.has(id))
    .slice(0, COLLECTION_POSTER_MAX);

  // A batch shares one conference, so the most common label wins.
  const labels = new Map<string, number>();

  for (const poster of posters) {
    const meta = poster.posterMetadata;
    const name =
      meta?.conferenceAcronym?.trim() || meta?.conferenceName?.trim() || "";

    if (!name) continue;

    const label = [name, meta?.conferenceYear].filter(Boolean).join(" ");

    labels.set(label, (labels.get(label) ?? 0) + 1);
  }

  const conference =
    [...labels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  return {
    details: {
      name: job.name.trim().slice(0, COLLECTION_NAME_MAX),
      description: "",
      conference: conference.slice(0, COLLECTION_CONFERENCE_MAX),
    },
    posterIds,
    skippedCount: rootIds.length - posterIds.length,
    existingCollection: job.collection
      ? {
          id: job.collection.id,
          path: collectionPath(job.collection.profileId),
          name: job.collection.name,
        }
      : null,
  };
});
