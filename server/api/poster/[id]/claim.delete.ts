import { logwatch } from "../../../utils/logwatch";

/** Removes the signed-in user's own claim on a poster, if they have one. */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;

  const { id } = event.context.params as { id: string };
  const posterId = Number.parseInt(id, 10);

  if (Number.isNaN(posterId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  // Accept any version's id. Claims are stored against the version root.
  const poster = await prisma.poster.findUnique({
    where: { id: posterId },
    select: { id: true, versionRootId: true },
  });

  if (!poster) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  const rootId = posterFamilyRootId(poster);

  const { count } = await prisma.posterClaim.deleteMany({
    where: { posterId: rootId, userId },
  });

  if (count === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "You haven't claimed this poster",
    });
  }

  logwatch.info({
    action: "poster.unclaim",
    message: "Poster claim removed by the claimant",
    userId,
    posterId: rootId,
  });

  return { success: true };
});
