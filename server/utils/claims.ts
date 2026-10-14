import { generateProfileId, profilePath } from "#shared/utils/profile";

/** Owner of every auto-indexed poster (ghost@posters.science). */
export const AUTO_INDEX_USER_ID = "0";

/**
 * Only auto-indexed posters can be claimed. A poster someone shared
 * themselves already has its author as owner.
 */
export function isClaimablePoster(root: {
  automated: boolean;
  userId: string;
  tombstone: boolean;
}): boolean {
  return (
    root.automated && root.userId === AUTO_INDEX_USER_ID && !root.tombstone
  );
}

/**
 * Loads the version root for any published poster id in a family. Claims are
 * always stored against the root so one claim covers every version.
 */
export async function loadClaimRoot(posterId: number) {
  const requested = await prisma.poster.findFirst({
    where: { id: posterId, status: "published" },
    select: { id: true, versionRootId: true },
  });

  if (!requested) return null;

  return prisma.poster.findUnique({
    where: { id: posterFamilyRootId(requested) },
    select: { id: true, automated: true, userId: true, tombstone: true },
  });
}

/**
 * Gives the user a profile id if they do not have one yet and returns it.
 * Ids are random, so a collision is astronomically unlikely, but the unique
 * index is the real guard and a clash just draws a new id.
 */
export async function ensureProfileId(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { profileId: true },
  });

  if (existing?.profileId) return existing.profileId;

  for (let attempt = 0; attempt < 5; attempt++) {
    const profileId = generateProfileId();
    const updated = await prisma.user
      .updateMany({
        where: { id: userId, profileId: null },
        data: { profileId },
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) return null;

        throw error;
      });

    if (updated === null) continue;

    if (updated.count === 1) return profileId;

    // Another request assigned one first. Use whatever it wrote.
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileId: true },
    });

    if (current?.profileId) return current.profileId;
  }

  throw createError({
    statusCode: 500,
    statusMessage: "Could not create a profile address. Please try again.",
  });
}

/** The public profile path, or null while the profile is private. */
export function publicProfilePath(user: {
  profilePublic: boolean;
  profileId: string | null;
  givenName: string;
  familyName: string;
}): string | null {
  if (!user.profilePublic || !user.profileId) return null;

  return profilePath({
    givenName: user.givenName,
    familyName: user.familyName,
    profileId: user.profileId,
  });
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
