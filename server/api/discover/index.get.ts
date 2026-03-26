export default defineCachedEventHandler(
  async (_event) => {
    const rawPosters =
      (await prisma.poster.findMany({
        where: {
          status: "published",
        },
        orderBy: {
          publishedAt: "desc",
        },
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
        views: viewsResults[i],
      }),
    );

    return {
      posters,
      total: count,
    };
  },
  { maxAge: 60 * 5 },
);
