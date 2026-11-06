import { z } from "zod";
import { logwatch } from "../../../../utils/logwatch";
import { requireOrgMember } from "../../../../utils/organizations";

const bodySchema = z.object({
  posterIds: z.array(z.number().int().positive()).min(1).max(200),
});

/**
 * Adds some of the member's own posters to the organization's page. Each must
 * be a published poster they published or claimed, given by its version root.
 */
export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const { session } = await requireOrgMember(event, organizationId);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) => bodySchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose the posters to add",
    });
  }

  const posterIds = [...new Set(body.data.posterIds)];
  const mine = await listablePosterRoots(userId);

  if (posterIds.some((posterId) => !mine.has(posterId))) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Only published posters you published or claimed can be added",
    });
  }

  const { count } = await prisma.organizationPoster.createMany({
    data: posterIds.map((posterId) => ({
      organizationId,
      posterId,
      addedById: userId,
    })),
    skipDuplicates: true,
  });

  logwatch.info({
    action: "organization.poster.add",
    message: "Posters added to an organization",
    userId,
    organizationId,
    posterIds,
    added: count,
  });

  return { added: count };
});
