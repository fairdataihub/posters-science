export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { user } = session;
  const userId = user.id;

  // Selected explicitly. Returning the whole row would ship the password hash
  // and the live email verification token to the browser.
  const found = await prisma.user.findUnique({
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
      profilePublic: true,
      profileShowLikes: true,
      profileId: true,
      affiliation: true,
      bio: true,
      orcid: true,
      created: true,
      updated: true,
      // Read only to derive hasPassword below, never returned.
      password: true,
      linkedAccounts: {
        select: { provider: true, providerAccountId: true, linkedAt: true },
      },
    },
  });

  if (!found) {
    return null;
  }

  const { password, ...rest } = found;

  return {
    ...rest,
    hasPassword: password !== null,
    profilePath: publicProfilePath(found),
  };
});
