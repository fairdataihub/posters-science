import type { MyCollection } from "#shared/types/collection";
import {
  myCollectionSelect,
  requireCollectionOwner,
  toMyCollection,
} from "../../../utils/collections";

/** One of the signed-in person's collections. */
export default defineEventHandler(async (event): Promise<MyCollection> => {
  const collectionId = getRouterParam(event, "id") ?? "";

  await requireCollectionOwner(event, collectionId);

  const row = await prisma.collection.findUniqueOrThrow({
    where: { id: collectionId },
    select: myCollectionSelect,
  });

  return toMyCollection(row);
});
