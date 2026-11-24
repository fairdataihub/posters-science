import { logwatch } from "../../../../utils/logwatch";

/** Undoes "Not me", so the poster is suggested again if it still matches. */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const userId = session.user.id;

  const posterId = Number.parseInt(getRouterParam(event, "posterId") ?? "", 10);

  if (!Number.isInteger(posterId) || posterId <= 0) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  const { count } = await prisma.claimSuggestionDismissal.deleteMany({
    where: { userId, posterId },
  });

  if (count > 0) {
    logwatch.info({
      action: "user.orcid_suggestions.restore",
      message: "Suggested poster brought back",
      userId,
      posterId,
    });
  }

  return { posterId, restored: count > 0 };
});
