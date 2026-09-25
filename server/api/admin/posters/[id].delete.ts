import { z } from "zod";

const bodySchema = z.object({
  reason: z.string().trim().min(1),
});

export default defineEventHandler(async (event) => {
  const session = await requireAdminSession(event);
  const posterId = Number(getRouterParam(event, "id"));

  if (isNaN(posterId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster id" });
  }

  const existing = await prisma.poster.findUnique({
    where: { id: posterId },
    select: {
      id: true,
      title: true,
      userId: true,
      status: true,
      versionRootId: true,
    },
  });
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  // Published posters are never hard-deleted. Instead they are tombstoned
  // (retired) so the record is preserved with a documented reason.
  if (existing.status === "published") {
    const body = await readValidatedBody(event, (b) => bodySchema.safeParse(b));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "A reason is required to retire a published poster",
      });
    }

    const rootId = posterFamilyRootId(existing);
    await prisma.poster.updateMany({
      where: posterFamilyWhere(rootId),
      data: { tombstone: true, tombedReason: body.data.reason },
    });

    await logAdminAction({
      adminUserId: session.user.id,
      action: "TOMBSTONE_POSTER",
      entityType: "poster",
      entityId: String(posterId),
      details: {
        title: existing.title,
        ownerId: existing.userId,
        reason: body.data.reason,
      },
    });

    return { success: true, tombstoned: true };
  }

  // Draft / downloaded posters are never public, so a hard delete is fine.
  await prisma.poster.delete({ where: { id: posterId } });

  await logAdminAction({
    adminUserId: session.user.id,
    action: "DELETE_POSTER",
    entityType: "poster",
    entityId: String(posterId),
    details: { title: existing.title, ownerId: existing.userId },
  });

  return { success: true, deleted: true };
});
