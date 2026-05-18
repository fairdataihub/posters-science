export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const search = (query.search as string | undefined)?.trim() || "";
  const role = (query.role as string | undefined) || "";

  const where = {
    ...(search
      ? {
          OR: [
            {
              emailAddress: { contains: search, mode: "insensitive" as const },
            },
            { givenName: { contains: search, mode: "insensitive" as const } },
            { familyName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(role ? { role } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        givenName: true,
        familyName: true,
        emailAddress: true,
        role: true,
        emailVerified: true,
        created: true,
        _count: { select: { Poster: true } },
      },
      orderBy: { created: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { data: users, total, page, limit };
});
