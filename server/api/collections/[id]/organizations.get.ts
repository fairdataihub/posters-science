import type { CollectionOrganizationChoices } from "#shared/types/collection";
import { requireCollectionOwner } from "../../../utils/collections";

/**
 * The owner's organizations and which of them show this collection. Ones they
 * have left are included while they still show it, so it can be taken off.
 */
export default defineEventHandler(
  async (event): Promise<CollectionOrganizationChoices> => {
    const collectionId = getRouterParam(event, "id") ?? "";
    const { session } = await requireCollectionOwner(event, collectionId);

    return {
      organizations: await collectionOrganizationChoices(
        session.user.id,
        collectionId,
      ),
    };
  },
);
