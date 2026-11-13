import {
  organizationAvatarUrl,
  organizationPath,
} from "#shared/utils/organization";
import { collectionPath } from "#shared/utils/collection";
import { parseProfileParam } from "#shared/utils/profile";
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
 * Public page for /collection/<profileId>. To anyone else, a private or hidden
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
  const profileId = parseProfileParam(handle ?? "");

  if (!profileId) throw notFound();

  const collection = await prisma.collection.findUnique({
    where: { profileId },
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
  const latestByRoot = await latestPublicPosterVersions([...addedAt.keys()]);

  const posters = [...latestByRoot.entries()]
    .map(([rootId, version]) =>
      toProfilePosterCard(
        version,
        // Auto-indexed posters reach a collection through the owner's claim.
        version.automated ? "author" : "publisher",
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
    path: collectionPath(collection.profileId),
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
