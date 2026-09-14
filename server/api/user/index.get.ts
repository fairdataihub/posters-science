export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  // Selected explicitly. Returning the whole row would ship the password hash
  // and the live email verification token to the browser.
  return await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      givenName: true,
      familyName: true,
      emailAddress: true,
      emailVerified: true,
      emailVerifiedAt: true,
      role: true,
      created: true,
      updated: true,
    },
  });
});
