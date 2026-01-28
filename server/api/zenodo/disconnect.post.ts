export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { user } = session;

  await prisma.zenodoToken.deleteMany({
    where: {
      userId: user.id,
    },
  });

  return { success: true };
});
