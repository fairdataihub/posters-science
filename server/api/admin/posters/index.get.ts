import type { SortField } from "../../../utils/adminPosters";

export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));

  const where = buildPosterAdminWhere({
    search: query.search as string | undefined,
    status: query.status as string | undefined,
    doi: query.doi as string | undefined,
    automated: query.automated as string | undefined,
    extraction: query.extraction as string | undefined,
  });

  const sortParam = (query.sort as string | undefined) ?? "created";
  const sort: SortField = isSortField(sortParam) ? sortParam : "created";
  const order = query.order === "asc" ? "asc" : "desc";

  const [posters, total] = await Promise.all([
    prisma.poster.findMany({
      where,
      select: POSTER_ADMIN_SELECT,
      orderBy: { [sort]: order },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.poster.count({ where }),
  ]);

  return { data: posters, total, page, limit };
});
