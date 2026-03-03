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
          doi: true,
          license: true,
        },
      },
      extractionJob: {
        select: {
          status: true,
        },
      },
    },
    where: {
      userId,
    },
    orderBy: {
      created: "desc",
    },
  });

  return posters || [];
});
