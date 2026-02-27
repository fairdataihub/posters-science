export default defineEventHandler(async (_event) => {
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

  const posters = rawPosters.map(({ posterMetadata, _count, ...poster }) => ({
    ...poster,
    keywords: posterMetadata?.subjects ?? [],
    likes: _count?.likes ?? 0,
  }));

  return {
    posters,
    total: count,
  };
});
