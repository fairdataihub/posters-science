export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const action = (query.action as string | undefined)?.trim() || "";
  const entityType = (query.entityType as string | undefined)?.trim() || "";

  const where = {
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        details: true,
        created: true,
        adminUser: {
          select: {
            id: true,
            givenName: true,
            familyName: true,
            emailAddress: true,
          },
        },
      },
      orderBy: { created: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return { data: logs, total, page, limit };
});
