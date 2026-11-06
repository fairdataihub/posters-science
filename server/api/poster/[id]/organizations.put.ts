import { z } from "zod";
import { logwatch } from "../../../utils/logwatch";

const bodySchema = z.object({
  organizationIds: z.array(z.string().min(1).max(64)).max(200),
});

/**
 * Sets which of the signed-in person's organizations show this poster. Adding
 * needs a published poster they published or claimed. They can only take off
 * listings they added themselves; an owner removes others from the
 * organization's manage pane.
 */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const userId = session.user.id;
  const rootId = await resolvePosterRootId(getRouterParam(event, "id"));

  const body = await readValidatedBody(event, (b) => bodySchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose the organizations to show this poster on",
    });
  }

  const current = await posterOrganizationChoices(userId, rootId);
  const memberOf = new Map(current.organizations.map((org) => [org.id, org]));
  const wanted = new Set(body.data.organizationIds);

  for (const organizationId of wanted) {
    if (!memberOf.has(organizationId)) {
      throw createError({
        statusCode: 404,
        statusMessage: "Organization not found",
      });
    }
  }

  const toAdd = [...wanted].filter((id) => !memberOf.get(id)!.listed);
  const toRemove = current.organizations
    .filter((org) => org.addedByMe && !wanted.has(org.id))
    .map((org) => org.id);

  if (toAdd.length > 0 && !current.canList) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Only published posters you published or claimed can be shown on an organization page",
    });
  }

  if (toAdd.length > 0 || toRemove.length > 0) {
    await prisma.$transaction([
      prisma.organizationPoster.deleteMany({
        where: {
          posterId: rootId,
          addedById: userId,
          organizationId: { in: toRemove },
        },
      }),
      // Another member may have added it a moment ago, which is the same result.
      prisma.organizationPoster.createMany({
        data: toAdd.map((organizationId) => ({
          organizationId,
          posterId: rootId,
          addedById: userId,
        })),
        skipDuplicates: true,
      }),
    ]);

    logwatch.info({
      action: "organization.poster.set",
      message: "Poster organizations updated",
      userId,
      posterId: rootId,
      added: toAdd,
      removed: toRemove,
    });
  }

  return posterOrganizationChoices(userId, rootId);
});
