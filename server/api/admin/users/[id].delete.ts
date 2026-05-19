export default defineEventHandler(async (event) => {
  const session = await requireAdminSession(event);
  const targetId = getRouterParam(event, "id");

  if (targetId === session.user.id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Cannot delete your own account",
    });
  }

  const existing = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, emailAddress: true },
  });
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  await prisma.user.delete({ where: { id: targetId } });

  await logAdminAction({
    adminUserId: session.user.id,
    action: "DELETE_USER",
    entityType: "user",
    entityId: targetId!,
    details: { emailAddress: existing.emailAddress },
  });

  return { success: true };
});
