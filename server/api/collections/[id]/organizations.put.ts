import { z } from "zod";
import type { CollectionOrganizationChoices } from "#shared/types/collection";
import { requireCollectionOwner } from "../../../utils/collections";
import { logwatch } from "../../../utils/logwatch";

const bodySchema = z.object({
  organizationIds: z.array(z.string().min(1).max(64)).max(200),
});

/**
 * Sets which organizations show this collection. Adding needs current
 * membership. The owner can take their collection off any page, even after
 * leaving the organization.
 */
export default defineEventHandler(
  async (event): Promise<CollectionOrganizationChoices> => {
    const collectionId = getRouterParam(event, "id") ?? "";
    const { session } = await requireCollectionOwner(event, collectionId);
    const userId = session.user.id;

    const body = await readValidatedBody(event, (b) => bodySchema.safeParse(b));

    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Choose the organizations to show this collection on",
      });
    }

    const current = await collectionOrganizationChoices(userId, collectionId);
    const known = new Map(current.map((org) => [org.id, org]));
    const wanted = new Set(body.data.organizationIds);

    for (const organizationId of wanted) {
      const org = known.get(organizationId);

      // A former member can keep a listing but not add a new one.
      if (!org || (org.role === null && !org.listed)) {
        throw createError({
          statusCode: 404,
          statusMessage: "Organization not found",
        });
      }
    }

    const toAdd = [...wanted].filter((id) => !known.get(id)!.listed);
    const toRemove = current
      .filter((org) => org.listed && !wanted.has(org.id))
      .map((org) => org.id);

    if (toAdd.length > 0 || toRemove.length > 0) {
      await prisma.$transaction([
        prisma.organizationCollection.deleteMany({
          where: { collectionId, organizationId: { in: toRemove } },
        }),
        prisma.organizationCollection.createMany({
          data: toAdd.map((organizationId) => ({
            organizationId,
            collectionId,
          })),
          skipDuplicates: true,
        }),
      ]);

      if (toAdd.length > 0) {
        logwatch.info({
          action: "collection.org.add",
          message: "Collection shown on organization pages",
          userId,
          collectionId,
          organizationIds: toAdd,
        });
      }

      if (toRemove.length > 0) {
        logwatch.info({
          action: "collection.org.remove",
          message: "Collection taken off organization pages",
          userId,
          collectionId,
          organizationIds: toRemove,
          removedBy: "collection_owner",
        });
      }
    }

    return {
      organizations: await collectionOrganizationChoices(userId, collectionId),
    };
  },
);
