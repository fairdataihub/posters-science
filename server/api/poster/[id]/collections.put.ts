import { z } from "zod";
import { COLLECTION_IDS_PER_REQUEST } from "#shared/utils/collection";
import { posterCollectionChoices } from "../../../utils/collections";
import { logwatch } from "../../../utils/logwatch";

const bodySchema = z.object({
  collectionIds: z
    .array(z.string().min(1).max(64))
    .max(COLLECTION_IDS_PER_REQUEST),
});

/**
 * Sets which of the signed-in person's collections hold this poster. Adding
 * needs a published poster they published or claimed. Taking it out always
 * works.
 */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const userId = session.user.id;
  const rootId = await resolvePosterRootId(getRouterParam(event, "id"));

  const body = await readValidatedBody(event, (b) => bodySchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose the collections for this poster",
    });
  }

  const current = await posterCollectionChoices(userId, rootId);
  const mine = new Map(current.collections.map((c) => [c.id, c]));
  const wanted = new Set(body.data.collectionIds);

  for (const collectionId of wanted) {
    if (!mine.has(collectionId)) {
      throw createError({
        statusCode: 404,
        statusMessage: "Collection not found",
      });
    }
  }

  const toAdd = [...wanted].filter((id) => !mine.get(id)!.listed);
  const toRemove = current.collections
    .filter((c) => c.listed && !wanted.has(c.id))
    .map((c) => c.id);

  if (toAdd.length > 0 && !current.canAdd) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Only published posters you published or claimed can be added to a collection",
    });
  }

  const full = toAdd.map((id) => mine.get(id)!).find((c) => c.full);

  if (full) {
    throw createError({
      statusCode: 409,
      statusMessage: `${full.name} is full. Remove some posters from it first.`,
      data: { reason: "full" },
    });
  }

  if (toAdd.length > 0 || toRemove.length > 0) {
    await prisma.$transaction([
      prisma.collectionPoster.deleteMany({
        where: { posterId: rootId, collectionId: { in: toRemove } },
      }),
      prisma.collectionPoster.createMany({
        data: toAdd.map((collectionId) => ({ collectionId, posterId: rootId })),
        skipDuplicates: true,
      }),
      prisma.collection.updateMany({
        where: { id: { in: [...toAdd, ...toRemove] } },
        data: { updated: new Date() },
      }),
    ]);

    logwatch.info({
      action: "collection.poster.set",
      message: "Poster collections updated",
      userId,
      posterId: rootId,
      added: toAdd,
      removed: toRemove,
    });
  }

  return posterCollectionChoices(userId, rootId);
});
