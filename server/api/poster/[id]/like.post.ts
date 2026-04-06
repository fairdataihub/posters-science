export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { id } = event.context.params as { id: string };
  const posterId = parseInt(id);

  if (isNaN(posterId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid poster ID",
    });
  }

  const { user } = session;
  const userId = user.id as string;

  const existing = await prisma.like.findUnique({
    where: {
      userId_posterId: { userId, posterId },
    },
  });

  if (existing) {
    await prisma.like.delete({
      where: {
        userId_posterId: { userId, posterId },
      },
    });
  } else {
    try {
      await prisma.like.create({
        data: {
          posterId,
          userId,
        },
      });
    } catch {
      // Ignore errors from unique constraints or race conditions
    }
  }

  const [likesCount, likedByCurrentUser] = await Promise.all([
    prisma.like.count({
      where: { posterId },
    }),
    prisma.like
      .findUnique({
        where: { userId_posterId: { userId, posterId } },
      })
      .then((row) => Boolean(row)),
  ]);

  return {
    likes: likesCount,
    liked: likedByCurrentUser,
  };
});
