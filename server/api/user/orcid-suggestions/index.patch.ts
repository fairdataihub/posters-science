import { z } from "zod";
import { logwatch } from "../../../utils/logwatch";

const settingsSchema = z.object({
  hidden: z.boolean(),
  /** Also bring back every poster the user marked "Not me". */
  restoreDismissed: z.boolean().optional(),
});

/** Hides or shows the suggested posters panel on the dashboard. */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) =>
    settingsSchema.safeParse(b),
  );

  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid settings" });
  }

  const { hidden, restoreDismissed } = body.data;

  const restoredDismissals = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { orcidSuggestionsHidden: hidden },
    });

    if (!restoreDismissed) return 0;

    const { count } = await tx.claimSuggestionDismissal.deleteMany({
      where: { userId },
    });

    return count;
  });

  logwatch.info({
    action: hidden
      ? "user.orcid_suggestions.hide"
      : "user.orcid_suggestions.show",
    message: hidden
      ? "Suggested posters hidden"
      : "Suggested posters shown again",
    userId,
    restoredDismissals,
  });

  return { hidden, restoredDismissals };
});
