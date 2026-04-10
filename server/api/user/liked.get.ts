export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  const likes = await prisma.like.findMany({
    where: { userId },
    orderBy: { created: "desc" },
    include: {
      poster: {
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
      },
    },
  });

  return likes.map(({ poster, created }) => ({
    ...poster,
    keywords: poster.posterMetadata?.subjects ?? [],
    likes: poster._count?.likes ?? 0,
    likedAt: created,
  }));
});
