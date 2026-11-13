import type { CollectionPosters } from "#shared/types/collection";
import { COLLECTION_POSTER_MAX } from "#shared/utils/collection";
import { requireCollectionOwner } from "../../../../utils/collections";
import { latestPublicPosterVersions } from "../../../../utils/profilePosters";

/**
 * The posters in a collection, and the owner's own posters that could be
 * added. Retired posters stay in the collection but aren't shown, and come
 * back if the poster is restored.
 */
export default defineEventHandler(async (event): Promise<CollectionPosters> => {
  const collectionId = getRouterParam(event, "id") ?? "";
  const { session } = await requireCollectionOwner(event, collectionId);

  const [items, mine] = await Promise.all([
    prisma.collectionPoster.findMany({
      where: { collectionId },
      orderBy: { created: "desc" },
      select: { posterId: true, created: true },
    }),
    listablePosterRoots(session.user.id),
  ]);

  const listedIds = new Set(items.map((item) => item.posterId));
  const availableIds = [...mine.keys()].filter((id) => !listedIds.has(id));

  const latestByRoot = await latestPublicPosterVersions([
    ...listedIds,
    ...availableIds,
  ]);

  const listed = items.flatMap((item) => {
    const version = latestByRoot.get(item.posterId);

    return version
      ? [
          {
            posterId: item.posterId,
            title: version.title,
            imageUrl: version.imageUrl,
            addedAt: item.created.toISOString(),
          },
        ]
      : [];
  });

  const available = availableIds
    .flatMap((posterId) => {
      const version = latestByRoot.get(posterId);

      return version
        ? [
            {
              posterId,
              title: version.title,
              imageUrl: version.imageUrl,
              role: mine.get(posterId)!,
              publishedAt: version.publishedAt?.toISOString() ?? null,
            },
          ]
        : [];
    })
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  return {
    listed,
    available,
    // Retired posters still take a place until they are removed.
    remaining: Math.max(0, COLLECTION_POSTER_MAX - items.length),
  };
});
