export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const status = (query.status as string | undefined)?.trim() || "";
  const search = (query.search as string | undefined)?.trim() || "";
  const searchAsId = Number.parseInt(search, 10);

  const where = {
    ...(status === "in-flight"
      ? { status: { notIn: TERMINAL_EXTRACTION_STATUSES } }
      : status
        ? { status }
        : {}),
    ...(search
      ? {
          OR: [
            { fileName: { contains: search, mode: "insensitive" as const } },
            {
              poster: {
                title: { contains: search, mode: "insensitive" as const },
              },
            },
            ...(String(searchAsId) === search
              ? [{ poster: { id: searchAsId } }]
              : []),
          ],
        }
      : {}),
  };

  const [jobs, total] = await Promise.all([
    prisma.extractionJob.findMany({
      where,
      select: {
        id: true,
        fileName: true,
        status: true,
        completed: true,
        error: true,
        created: true,
        updated: true,
        poster: {
          select: {
            id: true,
            title: true,
            status: true,
            automated: true,
            user: { select: { emailAddress: true } },
          },
        },
      },
      // Newest activity first: a job that just failed is the one an admin wants.
      orderBy: { updated: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.extractionJob.count({ where }),
  ]);

  return { data: jobs, total, page, limit };
});
