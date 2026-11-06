import type { OrganizationPosters } from "#shared/types/organization";
import { requireOrgMember } from "../../../../utils/organizations";
import { latestPublicPosterVersions } from "../../../../utils/profilePosters";

/**
 * The posters on an organization's page, and the member's own posters that
 * could be added. Retired posters keep their listing but aren't shown.
 */
export default defineEventHandler(
  async (event): Promise<OrganizationPosters> => {
    const organizationId = getRouterParam(event, "id") ?? "";
    const { session, role } = await requireOrgMember(event, organizationId);
    const userId = session.user.id;

    const [listings, mine] = await Promise.all([
      prisma.organizationPoster.findMany({
        where: { organizationId },
        orderBy: { created: "desc" },
        select: { posterId: true, created: true, addedById: true },
      }),
      listablePosterRoots(userId),
    ]);

    const listedIds = new Set(listings.map((listing) => listing.posterId));
    const availableIds = [...mine.keys()].filter((id) => !listedIds.has(id));

    const latestByRoot = await latestPublicPosterVersions([
      ...listedIds,
      ...availableIds,
    ]);

    const listed = listings.flatMap((listing) => {
      const version = latestByRoot.get(listing.posterId);

      if (!version) return [];

      const addedByMe = listing.addedById === userId;

      return [
        {
          posterId: listing.posterId,
          title: version.title,
          imageUrl: version.imageUrl,
          addedAt: listing.created.toISOString(),
          addedByMe,
          canRemove: role === "owner" || addedByMe,
        },
      ];
    });

    const available = availableIds
      .flatMap((posterId) => {
        const version = latestByRoot.get(posterId);

        return version
          ? [
              {
                posterId,
                title: version.title,
                imageUrl: version.imageUrl,
                role: mine.get(posterId)!,
                publishedAt: version.publishedAt?.toISOString() ?? null,
              },
            ]
          : [];
      })
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

    return { listed, available };
  },
);
