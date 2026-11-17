import { z } from "zod";
import {
  collectionDetailsSchema,
  collectionSlugSchema,
} from "#shared/utils/collection";
import { isUniqueConstraintError } from "../../../utils/claims";
import {
  myCollectionSelect,
  requireCollectionOwner,
  toMyCollection,
} from "../../../utils/collections";
import { logwatch } from "../../../utils/logwatch";

const updateSchema = collectionDetailsSchema.partial().extend({
  isPublic: z.boolean().optional(),
  // null removes the custom link.
  slug: collectionSlugSchema.nullable().optional(),
});

/**
 * Updates a collection's details, its custom link or whether it is public. An
 * admin's hide wins over isPublic, so the owner can't bring a hidden
 * collection back by toggling it. A custom link already in use is a 409.
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

  const { name, description, conference, isPublic, slug } = body.data;
  const detailsChanged =
    name !== undefined || description !== undefined || conference !== undefined;

  let row;

  try {
    row = await prisma.collection.update({
      where: { id: collectionId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(conference !== undefined && { conference }),
        ...(isPublic !== undefined && { isPublic }),
        ...(slug !== undefined && { slug }),
      },
      select: myCollectionSelect,
    });
  } catch (error) {
    if (slug && isUniqueConstraintError(error)) {
      throw createError({
        statusCode: 409,
        statusMessage: "That link is taken. Try another one.",
      });
    }

    throw error;
  }

  if (detailsChanged) {
    logwatch.info({
      action: "collection.update",
      message: "Collection details updated",
      userId,
      collectionId,
    });
  }

  if (slug !== undefined) {
    logwatch.info({
      action: "collection.link",
      message: slug ? "Collection link set" : "Collection link removed",
      userId,
      collectionId,
      slug,
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
