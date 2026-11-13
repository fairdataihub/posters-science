import { z } from "zod";
import { collectionDetailsSchema } from "#shared/utils/collection";
import {
  myCollectionSelect,
  requireCollectionOwner,
  toMyCollection,
} from "../../../utils/collections";
import { logwatch } from "../../../utils/logwatch";

const updateSchema = collectionDetailsSchema.partial().extend({
  isPublic: z.boolean().optional(),
});

/**
 * Updates a collection's details or whether it is public. An admin's hide wins
 * over isPublic, so the owner can't bring a hidden collection back by
 * toggling it.
 */
export default defineEventHandler(async (event) => {
  const collectionId = getRouterParam(event, "id") ?? "";
  const { session } = await requireCollectionOwner(event, collectionId);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) => updateSchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        body.error.issues[0]?.message ?? "Invalid collection details",
    });
  }

  const { name, description, conference, isPublic } = body.data;
  const detailsChanged =
    name !== undefined || description !== undefined || conference !== undefined;

  const row = await prisma.collection.update({
    where: { id: collectionId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(conference !== undefined && { conference }),
      ...(isPublic !== undefined && { isPublic }),
    },
    select: myCollectionSelect,
  });

  if (detailsChanged) {
    logwatch.info({
      action: "collection.update",
      message: "Collection details updated",
      userId,
      collectionId,
    });
  }

  if (isPublic !== undefined) {
    logwatch.info({
      action: "collection.visibility",
      message: isPublic ? "Collection made public" : "Collection made private",
      userId,
      collectionId,
    });
  }

  return toMyCollection(row);
});
