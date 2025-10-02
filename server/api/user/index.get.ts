export default defineEventHandler(async (event) => {
  throw createError({
    statusCode: 404,
    statusMessage: "Not enabled",
  });
  
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  return await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });
});
