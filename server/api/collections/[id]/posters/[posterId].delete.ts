import { requireCollectionOwner } from "../../../../utils/collections";
import { logwatch } from "../../../../utils/logwatch";

/** Takes a poster out of a collection. The poster itself is unchanged. */
export default defineEventHandler(async (event) => {
  const collectionId = getRouterParam(event, "id") ?? "";
  const { session } = await requireCollectionOwner(event, collectionId);
  const posterId = await resolvePosterRootId(getRouterParam(event, "posterId"));

  const { count } = await prisma.collectionPoster.deleteMany({
    where: { collectionId, posterId },
  });

  if (count === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "This poster isn't in the collection",
    });
  }

  // Counts as a change, so the collection moves up the owner's list.
  await prisma.collection.update({
    where: { id: collectionId },
    data: { updated: new Date() },
    select: { id: true },
  });

  logwatch.info({
    action: "collection.poster.remove",
    message: "Poster removed from a collection",
    userId: session.user.id,
    collectionId,
    posterId,
  });

  return { success: true };
});
