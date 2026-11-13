import { requireCollectionOwner } from "../../../utils/collections";
import { logwatch } from "../../../utils/logwatch";

/**
 * Deletes a collection and its organization listings. Its posters are
 * untouched. A hidden collection can't be deleted, so a moderation decision
 * stays on record.
 */
export default defineEventHandler(async (event) => {
  const collectionId = getRouterParam(event, "id") ?? "";
  const { session, collection } = await requireCollectionOwner(
    event,
    collectionId,
  );

  if (collection.hiddenAt) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "This collection was hidden by the Posters.science team. Contact us if you need it removed.",
    });
  }

  await prisma.collection.delete({ where: { id: collectionId } });

  logwatch.info({
    action: "collection.delete",
    message: "Collection deleted by its owner",
    userId: session.user.id,
    collectionId,
  });

  return { success: true };
});
