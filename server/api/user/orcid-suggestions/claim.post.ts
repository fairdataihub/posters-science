import { z } from "zod";
import { logwatch } from "../../../utils/logwatch";
import {
  ORCID_SUGGESTIONS_LIMIT,
  matchingOrcidFor,
  orcidSuggestionRootIds,
} from "../../../utils/orcidSuggestions";

const claimSchema = z.object({
  posterIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(ORCID_SUGGESTIONS_LIMIT),
});

/**
 * Claims suggested posters as an author, one or several at once. Only posters
 * that are still suggested to this user can be claimed here; anything else
 * goes through the normal claim on the poster page. Same claim as there: not
 * verified, author role only, nothing about the poster changes.
 */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) => claimSchema.safeParse(b));

  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid posters" });
  }

  const { orcid } = await matchingOrcidFor(userId);

  if (!orcid) {
    throw createError({
      statusCode: 409,
      statusMessage: "Add your ORCID iD on your settings page first",
    });
  }

  const suggested = new Set(await orcidSuggestionRootIds(userId, orcid));
  const posterIds = [...new Set(body.data.posterIds)].filter((id) =>
    suggested.has(id),
  );

  if (posterIds.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: "These posters are no longer suggested to you",
    });
  }

  const { count } = await prisma.posterClaim.createMany({
    data: posterIds.map((posterId) => ({ posterId, userId })),
    skipDuplicates: true,
  });

  logwatch.info({
    action: "poster.claim",
    message: `Claimed ${count} suggested poster(s) as author`,
    userId,
    source: "orcid_suggestion",
    posterIds,
    count,
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profilePublic: true },
  });

  return { claimed: count, profilePublic: user?.profilePublic ?? false };
});
