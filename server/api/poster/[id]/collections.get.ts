import type { PosterCollectionChoices } from "#shared/types/collection";
import { posterCollectionChoices } from "../../../utils/collections";

/** The signed-in person's collections, and which of them hold this poster. */
export default defineEventHandler(
  async (event): Promise<PosterCollectionChoices> => {
    const session = await requireDbUserSession(event);
    const rootId = await resolvePosterRootId(getRouterParam(event, "id"));

    return posterCollectionChoices(session.user.id, rootId);
  },
);
