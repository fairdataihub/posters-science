import { z } from "zod";
import { logwatch } from "../../../../utils/logwatch";
import { requireOrgMember } from "../../../../utils/organizations";

const bodySchema = z.object({
  collectionIds: z.array(z.string().min(1).max(64)).min(1).max(200),
});

/** Adds some of the member's own collections to the organization's page. */
export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const { session } = await requireOrgMember(event, organizationId);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) => bodySchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose the collections to add",
    });
  }

  const collectionIds = [...new Set(body.data.collectionIds)];
  const owned = await prisma.collection.count({
    where: { id: { in: collectionIds }, ownerId: userId },
  });

  if (owned !== collectionIds.length) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only your own collections can be added",
    });
  }

  const { count } = await prisma.organizationCollection.createMany({
    data: collectionIds.map((collectionId) => ({
      organizationId,
      collectionId,
    })),
    skipDuplicates: true,
  });

  logwatch.info({
    action: "collection.org.add",
    message: "Collections added to an organization",
    userId,
    organizationId,
    collectionIds,
    added: count,
  });

  return { added: count };
});
