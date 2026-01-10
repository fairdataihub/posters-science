export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { id } = event.context.params as { id: string };

  const { user } = session;
  const userId = user.id;

  const poster = await prisma.poster.findUnique({
    where: {
      id: parseInt(id),
      userId,
    },
  });

  if (!poster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  return poster;
});
