export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  return await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });
});
