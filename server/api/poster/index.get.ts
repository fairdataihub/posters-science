export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { environment } = config.public;

  if (environment !== "development") {
    throw createError({
      statusCode: 404,
      statusMessage: "Not enabled",
    });
  }

  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  return (
    (await prisma.poster.findMany({
      where: {
        userId,
      },
    })) || []
  );
});
