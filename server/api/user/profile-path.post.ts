import { profilePath } from "#shared/utils/profile";

/**
 * The signed-in user's own profile address, creating the profile id first if
 * they have never had one. Backs /profile/me, so "Profile" in the account menu
 * always has somewhere to go, whether the profile is public or private.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;

  const profileId = await ensureProfileId(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { givenName: true, familyName: true },
  });

  return {
    path: profilePath({
      givenName: user?.givenName ?? "",
      familyName: user?.familyName ?? "",
      profileId,
    }),
  };
});
