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
      },
    })) || [];

  const count = await prisma.poster.count({
    where: {
      status: "published",
    },
  });

  const posters = rawPosters.map(({ posterMetadata, ...poster }) => ({
    ...poster,
    keywords: posterMetadata?.subjects ?? [],
  }));

  return {
    posters,
    total: count,
  };
});
