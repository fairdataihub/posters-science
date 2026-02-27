export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  const posters = await prisma.poster.findMany({
    include: {
      posterMetadata: {
        select: {
          publisher: true,
          publicationYear: true,
        },
      },
    },
    where: {
      userId,
    },
    orderBy: {
      created: "desc",
    },
    include: {
      extractionJob: {
        select: {
          status: true,
        },
      },
    },
  });

  return posters || [];
});
