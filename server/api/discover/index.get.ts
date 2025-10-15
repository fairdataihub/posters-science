export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { environment } = config.public;

  if (environment !== "development") {
    throw createError({
      statusCode: 404,
      statusMessage: "Not enabled",
    });
  }

  const posters =
    (await prisma.poster.findMany({
      where: {
        status: "published",
      },
      orderBy: {
        publishedAt: "desc",
      },
      include: {
        user: {
          select: {
            givenName: true,
            familyName: true,
          },
        },
      },
    })) || [];

  const count = await prisma.poster.count({
    where: {
      status: "published",
    },
  });

  return {
    posters,
    total: count,
  };
});
