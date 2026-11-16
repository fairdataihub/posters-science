import { buildDiscoverPosterWhere } from "../../utils/discoverPosterWhere";

const EMPTY_RESPONSE = { posters: [] as never[], total: 0 };

export default defineEventHandler(async (event) => {
  const requestStartedAt = Date.now();
  let previousStepAt = requestStartedAt;
  const timings: Record<string, number> = {};

  const markStep = (step: string) => {
    const now = Date.now();
    timings[step] = now - previousStepAt;
    previousStepAt = now;
  };

  const { page, limit, sortBy } = getQuery(event);

  const pageNum = Math.max(1, parseInt(String(page || "1")));
  const limitNum = Math.min(50, Math.max(1, parseInt(String(limit || "9"))));
  const skip = (pageNum - 1) * limitNum;
  markStep("query-parse");

  const sortByStr = String(sortBy || "Newest First");
  const isSortByViews = sortByStr === "Most Viewed";

  type PrismaOrderBy =
    | { publishedAt: "asc" | "desc" }
    | { createdAt: "asc" | "desc" }
    | { likes: { _count: "asc" | "desc" } };

  const orderBy: PrismaOrderBy = (() => {
    switch (sortByStr) {
      case "Oldest First":
        return { publishedAt: "asc" };
      case "Most Liked":
        return { likes: { _count: "desc" } };
      case "Newest First":
      default:
        return { publishedAt: "desc" };
    }
  })();
  markStep("sort-setup");

  const whereClause = await buildDiscoverPosterWhere(getQuery(event), markStep);
  if (!whereClause) return EMPTY_RESPONSE;

  const rawPosters =
    (await prisma.poster.findMany({
      where: whereClause,
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
        versionRoot: {
          select: { _count: { select: { likes: true } } },
        },
      },
    })) || [];
  markStep("db-findMany");

  const count = await prisma.poster.count({
    where: whereClause,
  });
  markStep("db-count");

  const posters = rawPosters.map(
    ({ posterMetadata, _count, versionRoot, ...poster }) => ({
      ...poster,
      id: poster.versionRootId ?? poster.id,
      keywords: posterMetadata?.subjects ?? [],
      likes: versionRoot?._count.likes ?? _count?.likes ?? 0,
    }),
  );
  markStep("poster-map");

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
