export default defineEventHandler(async (event) => {
  const { search, page, limit, sortBy } = getQuery(event);

  const pageNum = Math.max(1, parseInt(String(page || "1")));
  const limitNum = Math.min(50, Math.max(1, parseInt(String(limit || "9"))));
  const skip = (pageNum - 1) * limitNum;

  const searchFilter = search
    ? {
        OR: [
          {
            title: {
              contains: String(search),
              mode: "insensitive" as const,
            },
          },
          {
            description: {
              contains: String(search),
              mode: "insensitive" as const,
            },
          },
        ],
      }
    : {};

  const sortByStr = String(sortBy || "Newest");
  const isSortByViews = sortByStr === "Most viewed";

  type PrismaOrderBy =
    | { publishedAt: "asc" | "desc" }
    | { createdAt: "asc" | "desc" }
    | { likes: { _count: "asc" | "desc" } };

  const orderBy: PrismaOrderBy = (() => {
    switch (sortByStr) {
      case "Oldest":
        return { publishedAt: "asc" };
      case "Most liked":
        return { likes: { _count: "desc" } };
      case "Newest":
      default:
        return { publishedAt: "desc" };
    }
  })();

  const rawPosters =
    (await prisma.poster.findMany({
      where: {
        status: "published",
        ...searchFilter,
      },
      orderBy: isSortByViews ? { publishedAt: "desc" } : orderBy,
      skip,
      take: limitNum,
      include: {
        posterMetadata: {
          select: {
            subjects: true,
          },
        },
        _count: {
          select: { likes: true },
        },
      },
    })) || [];

  const count = await prisma.poster.count({
    where: {
      status: "published",
      ...searchFilter,
    },
  });

  const { umamiWebsiteId } = useRuntimeConfig();
  const umamiToken = await getUmamiToken();
  const endAt = String(Date.now());

  const viewsResults = await Promise.all(
    rawPosters.map(async (poster) => {
      if (!umamiToken || !umamiWebsiteId) return null;
      try {
        const params = new URLSearchParams({
          startAt: "0",
          endAt,
          path: `/discover/${poster.id}`,
        });
        const data = await $fetch<{ visits: number }>(
          `https://umami.fairdataihub.org/api/websites/${umamiWebsiteId}/stats?${params}`,
          { headers: { Authorization: `Bearer ${umamiToken}` } },
        );

        return data.visits ?? null;
      } catch {
        return null;
      }
    }),
  );

  const posters = rawPosters.map(
    ({ posterMetadata, _count, ...poster }, i) => ({
      ...poster,
      keywords: posterMetadata?.subjects ?? [],
      likes: _count?.likes ?? 0,
      views: viewsResults[i] ?? 0,
    }),
  );

  if (isSortByViews) {
    posters.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  }

  return {
    posters,
    total: count,
  };
});
