import { logwatch } from "../../../utils/logwatch";

/** Removes the signed-in user's own claim on a poster, if they have one. */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;

  const { id } = event.context.params as { id: string };
  const posterId = Number.parseInt(id, 10);

  if (Number.isNaN(posterId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  // Accept any version's id. Claims are stored against the version root.
  const poster = await prisma.poster.findUnique({
    where: { id: posterId },
    select: { id: true, versionRootId: true },
  });

  if (!poster) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  const rootId = posterFamilyRootId(poster);

  // The claim is what let them show the poster on an organization page and
  // keep it in their collections, so the listings they added go with it.
  const { count, listingsRemoved, collectionItemsRemoved } =
    await prisma.$transaction(async (tx) => {
      const claims = await tx.posterClaim.deleteMany({
        where: { posterId: rootId, userId },
      });

      if (claims.count === 0) {
        return { count: 0, listingsRemoved: 0, collectionItemsRemoved: 0 };
      }

      const listings = await tx.organizationPoster.deleteMany({
        where: { posterId: rootId, addedById: userId },
      });
      const items = await tx.collectionPoster.deleteMany({
        where: { posterId: rootId, collection: { ownerId: userId } },
      });

      return {
        count: claims.count,
        listingsRemoved: listings.count,
        collectionItemsRemoved: items.count,
      };
    });

  if (count === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "You haven't claimed this poster",
    });
  }

  logwatch.info({
    action: "poster.unclaim",
    message: "Poster claim removed by the claimant",
    userId,
    posterId: rootId,
    organizationListingsRemoved: listingsRemoved,
    collectionItemsRemoved,
  });

  return { success: true };
});
