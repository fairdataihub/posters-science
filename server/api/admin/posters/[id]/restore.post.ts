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
      tombstone: true,
      versionRootId: true,
    },
  });
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  if (!existing.tombstone) {
    throw createError({
      statusCode: 400,
      statusMessage: "Poster is not tombstoned",
    });
  }

  const rootId = posterFamilyRootId(existing);
  await prisma.poster.updateMany({
    where: posterFamilyWhere(rootId),
    data: { tombstone: false, tombedReason: "" },
  });

  await logAdminAction({
    adminUserId: session.user.id,
    action: "RESTORE_POSTER",
    entityType: "poster",
    entityId: String(posterId),
    details: { title: existing.title, ownerId: existing.userId },
  });

  return { success: true, restored: true };
});
