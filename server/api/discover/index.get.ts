export default defineEventHandler(async (event) => {
  const { search } = getQuery(event);

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

  const rawPosters =
    (await prisma.poster.findMany({
      where: {
        status: "published",
        ...searchFilter,
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
      views: viewsResults[i],
    }),
  );

  return {
    posters,
    total: count,
  };
});
