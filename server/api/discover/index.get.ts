export default defineEventHandler(async (event) => {
  const requestStartedAt = Date.now();
  let previousStepAt = requestStartedAt;
  const timings: Record<string, number> = {};

  const markStep = (step: string) => {
    const now = Date.now();
    timings[step] = now - previousStepAt;
    previousStepAt = now;
  };

  const { search, page, limit, sortBy, dateFrom, dateTo } = getQuery(event);

  const pageNum = Math.max(1, parseInt(String(page || "1")));
  const limitNum = Math.min(50, Math.max(1, parseInt(String(limit || "9"))));
  const skip = (pageNum - 1) * limitNum;
  markStep("query-parse");

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
  markStep("search-filter");

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
  markStep("sort-setup");

  const dateFilter =
    dateFrom || dateTo
      ? {
          publishedAt: {
            ...(dateFrom ? { gte: new Date(String(dateFrom)) } : {}),
            ...(dateTo
              ? (() => {
                  const end = new Date(String(dateTo));
                  end.setHours(23, 59, 59, 999);

                  return { lte: end };
                })()
              : {}),
          },
        }
      : {};
  markStep("date-filter");

  const rawPosters =
    (await prisma.poster.findMany({
      where: {
        status: "published",
        ...searchFilter,
        ...dateFilter,
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
  markStep("db-findMany");

  const count = await prisma.poster.count({
    where: {
      status: "published",
      ...searchFilter,
      ...dateFilter,
    },
  });
  markStep("db-count");

  const { umamiWebsiteId } = useRuntimeConfig();
  const umamiToken = await getUmamiToken();
  const endAt = String(Date.now());
  markStep("umami-auth");

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
  markStep("umami-views");

  const posters = rawPosters.map(
    ({ posterMetadata, _count, ...poster }, i) => ({
      ...poster,
      keywords: posterMetadata?.subjects ?? [],
      likes: _count?.likes ?? 0,
      views: viewsResults[i] ?? 0,
    }),
  );
  markStep("poster-map");

  if (isSortByViews) {
    posters.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  }
  markStep("post-sort");

  const totalDurationMs = Date.now() - requestStartedAt;
  event.node.res.setHeader(
    "Server-Timing",
    Object.entries(timings)
      .map(([name, duration]) => `${name};dur=${duration}`)
      .join(", "),
  );

  console.info("[discover:index.get] timings", {
    ...timings,
    total: totalDurationMs,
    posters: rawPosters.length,
  });

  return {
    posters,
    total: count,
  };
});
