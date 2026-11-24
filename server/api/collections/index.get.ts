import type { MyCollection } from "#shared/types/collection";
import { myCollectionSelect, toMyCollections } from "../../utils/collections";

/** The signed-in person's collections, most recently changed first. */
export default defineEventHandler(
  async (event): Promise<{ collections: MyCollection[] }> => {
    const session = await requireDbUserSession(event);

    const rows = await prisma.collection.findMany({
      where: { ownerId: session.user.id },
      orderBy: { updated: "desc" },
      select: myCollectionSelect,
    });

    return { collections: await toMyCollections(rows) };
  },
);
