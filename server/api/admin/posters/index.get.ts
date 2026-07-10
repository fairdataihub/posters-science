export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const search = (query.search as string | undefined)?.trim() || "";
  const status = (query.status as string | undefined) || "";

  const where = {
    // user: { emailAddress: { not: "ghost@posters.science" } }, // Exclude posters from scraper
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            {
              user: {
                emailAddress: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            },
          ],
        }
      : {}),
    ...(status === "tombstoned"
      ? { tombstone: true }
      : status
        ? { status }
        : {}),
  };

  const [posters, total] = await Promise.all([
    prisma.poster.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        tombstone: true,
        tombedReason: true,
        publishedAt: true,
        created: true,
        user: {
          select: {
            id: true,
            givenName: true,
            familyName: true,
            emailAddress: true,
          },
        },
        zenodoDepositions: {
          select: { lastPublishedZenodoDoi: true },
        },
      },
      orderBy: { created: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.poster.count({ where }),
  ]);

  return { data: posters, total, page, limit };
});
