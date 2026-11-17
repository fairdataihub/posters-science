import { z } from "zod";
import { logwatch } from "../../../utils/logwatch";

const patchSchema = z.object({
  hidden: z.boolean(),
  reason: z.string().trim().min(1).max(1000),
});

/**
 * Hides a collection from the public or restores it. Its posters are
 * untouched and stay public on their own pages.
 */
export default defineEventHandler(async (event) => {
  const session = await requireAdminSession(event);
  const collectionId = getRouterParam(event, "id") ?? "";

  const body = await readValidatedBody(event, (b) => patchSchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "A reason is required",
    });
  }

  const { hidden, reason } = body.data;

  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { hiddenAt: true, name: true, ownerId: true },
  });

  if (!collection) {
    throw createError({
      statusCode: 404,
      statusMessage: "Collection not found",
    });
  }

  if ((collection.hiddenAt !== null) === hidden) {
    throw createError({
      statusCode: 409,
      statusMessage: hidden
        ? "This collection is already hidden"
        : "This collection is not hidden",
    });
  }

  const updated = await prisma.collection.update({
    where: { id: collectionId },
    data: {
      hiddenAt: hidden ? new Date() : null,
      hiddenReason: hidden ? reason : "",
    },
    select: { id: true, hiddenAt: true, hiddenReason: true },
  });

  await logAdminAction({
    adminUserId: session.user.id,
    action: hidden ? "HIDE_COLLECTION" : "RESTORE_COLLECTION",
    entityType: "collection",
    entityId: collectionId,
    details: { name: collection.name, ownerId: collection.ownerId, reason },
  });

  logwatch.info({
    action: hidden ? "admin.collection.hide" : "admin.collection.restore",
    message: hidden ? "Collection hidden by an admin" : "Collection restored",
    userId: session.user.id,
    collectionId,
    reason,
  });

  return updated;
});
