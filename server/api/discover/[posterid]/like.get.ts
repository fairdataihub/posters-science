export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session?.user?.id;

  const { posterid } = event.context.params as { posterid: string };
  const posterId = parseInt(posterid);

  if (isNaN(posterId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  const poster = await prisma.poster.findFirst({
    where: { id: posterId, status: "published" },
    select: { id: true },
  });

  if (!poster) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  const [likes, liked] = await Promise.all([
    prisma.like.count({
      where: { posterId },
    }),
    userId
      ? prisma.like
          .findUnique({
            where: {
              userId_posterId: { userId, posterId },
            },
          })
          .then((row) => Boolean(row))
      : Promise.resolve(false),
  ]);

  return { likes, liked };
});
