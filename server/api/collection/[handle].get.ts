import {
  organizationAvatarUrl,
  organizationPath,
} from "#shared/utils/organization";
import {
  collectionPath,
  parseCollectionHandle,
} from "#shared/utils/collection";
import {
  collectionOwner,
  collectionSummarySelect,
} from "../../utils/collections";
import {
  latestPublicPosterVersions,
  matchProfilePosterSearch,
  toProfilePosterCard,
} from "../../utils/profilePosters";

/**
 * Public page for /collection/<profileId> or /collection/<slug>. `path` is the
 * custom link when there is one, so the page can redirect the id address to
 * it. To anyone else, a private or hidden
 * collection and an unknown id all return 404. The owner can open it to
 * preview it, and site admins can open it to moderate it.
 *
 * `search` takes the Discover search syntax. Every poster is still returned so
 * the page can show totals; `searchMatches` lists the ones that match.
 */
export default defineEventHandler(async (event) => {
  const notFound = () =>
    createError({ statusCode: 404, statusMessage: "Collection not found" });

  const { handle } = event.context.params as { handle: string };
  const where = parseCollectionHandle(handle ?? "");

  if (!where) throw notFound();

  const collection = await prisma.collection.findUnique({
    where,
    select: {
      ...collectionSummarySelect,
      ownerId: true,
      isPublic: true,
      hiddenAt: true,
      hiddenReason: true,
    },
  });

  const session = await getUserSession(event);
  const isOwner =
    Boolean(collection) && session?.user?.id === collection?.ownerId;
  const isAdmin = session?.user?.role === "admin";

  const isHidden = Boolean(collection?.hiddenAt);
  const isPublic = Boolean(collection?.isPublic) && !isHidden;
  const canPreview = isOwner || isAdmin;

  if (!collection || (!isPublic && !canPreview)) throw notFound();

  const [items, listings] = await Promise.all([
    prisma.collectionPoster.findMany({
      where: { collectionId: collection.id },
      select: { posterId: true, created: true },
    }),
    // Only pages visitors can open.
    prisma.organizationCollection.findMany({
      where: {
        collectionId: collection.id,
        organization: { profilePublic: true, hiddenAt: null },
      },
      orderBy: { created: "asc" },
      select: { organization: { select: { profileId: true, name: true } } },
    }),
  ]);

  const addedAt = new Map(items.map((item) => [item.posterId, item.created]));
  const [latestByRoot, ownerRoles] = await Promise.all([
    latestPublicPosterVersions([...addedAt.keys()]),
    // How the owner holds each poster. Anyone else's poster gets no badge.
    listablePosterRoots(collection.ownerId),
  ]);

  const posters = [...latestByRoot.entries()]
    .map(([rootId, version]) =>
      toProfilePosterCard(
        version,
        ownerRoles.get(rootId) ?? null,
        addedAt.get(rootId) ?? null,
      ),
    )
    .sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );

  return {
    // Only the owner needs the internal id, for the Manage link.
    id: isOwner ? collection.id : null,
    path: collectionPath(collection.profileId, collection.slug),
    name: collection.name,
    description: collection.description,
    conference: collection.conference,
    owner: collectionOwner(collection.owner),
    isOwner,
    isPublic,
    isHidden,
    hiddenReason: canPreview ? collection.hiddenReason : "",
    organizations: listings.map(({ organization }) => ({
      name: organization.name,
      path: organizationPath(organization.profileId),
      avatarUrl: organizationAvatarUrl(organization.profileId),
    })),
    created: collection.created,
    updated: collection.updated,
    posters,
    searchMatches: await matchProfilePosterSearch(
      getQuery(event).search,
      posters,
    ),
  };
});
