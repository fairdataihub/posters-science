import { z } from "zod";
import { logwatch } from "../../../../utils/logwatch";
import {
  matchingOrcidFor,
  orcidSuggestionRootIds,
} from "../../../../utils/orcidSuggestions";

const dismissSchema = z.object({ posterId: z.number().int().positive() });

/** "Not me": stops suggesting one poster to this user. Claims are untouched. */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) =>
    dismissSchema.safeParse(b),
  );

  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster" });
  }

  const { posterId } = body.data;
  const { orcid } = await matchingOrcidFor(userId);
  const suggested = orcid ? await orcidSuggestionRootIds(userId, orcid) : [];

  if (!suggested.includes(posterId)) {
    throw createError({
      statusCode: 404,
      statusMessage: "This poster isn't suggested to you",
    });
  }

  await prisma.claimSuggestionDismissal.createMany({
    data: [{ userId, posterId }],
    skipDuplicates: true,
  });

  logwatch.info({
    action: "user.orcid_suggestions.dismiss",
    message: "Suggested poster marked Not me",
    userId,
    posterId,
  });

  return { posterId };
});
