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

  // Deleting the only owner would leave an organization nobody can manage.
  const ownerships = await prisma.organizationMember.findMany({
    where: { userId: targetId, role: "owner" },
    select: {
      organization: {
        select: {
          name: true,
          _count: { select: { members: { where: { role: "owner" } } } },
        },
      },
    },
  });
  const soleOwnerOf = ownerships
    .map(({ organization }) => organization)
    .filter((organization) => organization._count.members <= 1)
    .map((organization) => organization.name);

  if (soleOwnerOf.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `This person is the only owner of ${soleOwnerOf.join(", ")}. Another member has to become an owner, or the organization has to be deleted, before the account can be removed.`,
    });
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
