export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  const posters = await prisma.poster.findMany({
    where: {
      userId,
    },
    orderBy: {
      created: "desc",
    },
  });

  return posters || [];
});
