import { logwatch } from "../../../utils/logwatch";

/**
 * Claims an auto-indexed poster as an author for the signed-in user. There is
 * nothing to choose and nothing is verified: the claim is approved at once and
 * grants the author role only. The poster appears on the user's profile and
 * dashboard, and ownership, editing and publishing are unchanged.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;

  const { id } = event.context.params as { id: string };
  const posterId = Number.parseInt(id, 10);

  if (Number.isNaN(posterId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  const root = await loadClaimRoot(posterId);

  if (!root) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  if (!isClaimablePoster(root)) {
    throw createError({
      statusCode: 400,
      statusMessage: "This poster can't be claimed",
    });
  }

  try {
    const claim = await prisma.posterClaim.create({
      data: { posterId: root.id, userId },
      select: { id: true, role: true, created: true },
    });

    logwatch.info({
      action: "poster.claim",
      message: "Poster claimed as author",
      userId,
      posterId: root.id,
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { profilePublic: true },
    });

    return { claim, profilePublic: user?.profilePublic ?? false };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    throw createError({
      statusCode: 409,
      statusMessage: "You've already claimed this poster",
    });
  }
});
