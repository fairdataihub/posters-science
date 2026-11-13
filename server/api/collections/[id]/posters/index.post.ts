import { z } from "zod";
import { COLLECTION_IDS_PER_REQUEST } from "#shared/utils/collection";
import {
  assertCollectionRoom,
  requireCollectionOwner,
} from "../../../../utils/collections";
import { logwatch } from "../../../../utils/logwatch";

const bodySchema = z.object({
  posterIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(COLLECTION_IDS_PER_REQUEST),
});

/**
 * Adds some of the owner's posters to a collection. Each must be a published
 * poster they published or claimed, given by its version root.
 */
export default defineEventHandler(async (event) => {
  const collectionId = getRouterParam(event, "id") ?? "";
  const { session } = await requireCollectionOwner(event, collectionId);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) => bodySchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose the posters to add",
    });
  }

  const posterIds = [...new Set(body.data.posterIds)];
  const mine = await listablePosterRoots(userId);

  if (posterIds.some((posterId) => !mine.has(posterId))) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Only published posters you published or claimed can be added",
    });
  }

  const alreadyIn = await prisma.collectionPoster.count({
    where: { collectionId, posterId: { in: posterIds } },
  });

  await assertCollectionRoom(collectionId, posterIds.length - alreadyIn);

  const [{ count }] = await prisma.$transaction([
    prisma.collectionPoster.createMany({
      data: posterIds.map((posterId) => ({ collectionId, posterId })),
      skipDuplicates: true,
    }),
    // Counts as a change, so the collection moves up the owner's list.
    prisma.collection.update({
      where: { id: collectionId },
      data: { updated: new Date() },
      select: { id: true },
    }),
  ]);

  logwatch.info({
    action: "collection.poster.add",
    message: "Posters added to a collection",
    userId,
    collectionId,
    posterIds,
    added: count,
  });

  return { added: count };
});
