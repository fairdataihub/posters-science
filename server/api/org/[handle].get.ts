import {
  organizationAvatarUrl,
  organizationPath,
} from "#shared/utils/organization";
import { parseProfileParam } from "#shared/utils/profile";
import {
  collectionSummarySelect,
  publicCollectionWhere,
  toCollectionSummaries,
} from "../../utils/collections";
import {
  latestPublicPosterVersions,
  matchProfilePosterSearch,
  toProfilePosterCard,
} from "../../utils/profilePosters";

/**
 * Public page for /org/<profileId>. To anyone outside the organization, a
 * private or hidden page and an unknown id all return 404. Members can open it
 * to preview it, and site admins can open it to moderate it. Members are never
 * named here, because their personal profiles are opt-in, and visitors only
 * get the member count while the owners allow it.
 *
 * `search` takes the Discover search syntax. Every poster is still returned so
 * the page can show totals; `searchMatches` lists the ones that match.
 */
export default defineEventHandler(async (event) => {
  const notFound = () =>
    createError({ statusCode: 404, statusMessage: "Organization not found" });

  const { handle } = event.context.params as { handle: string };
  const profileId = parseProfileParam(handle ?? "");

  if (!profileId) throw notFound();

  const organization = await prisma.organization.findUnique({
    where: { profileId },
    select: {
      id: true,
      profileId: true,
      name: true,
      description: true,
      websiteUrl: true,
      profilePublic: true,
      showMemberCount: true,
      hiddenAt: true,
      hiddenReason: true,
      _count: { select: { members: true } },
    },
  });

  const session = await getUserSession(event);
  const userId = session?.user?.id;
  const isAdmin = session?.user?.role === "admin";

  const membership =
    organization && userId
      ? await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: organization.id,
              userId,
            },
          },
          select: { role: true },
        })
      : null;

  const isHidden = Boolean(organization?.hiddenAt);
  const isPublic = Boolean(organization?.profilePublic) && !isHidden;
  const canPreview = Boolean(membership) || isAdmin;

  if (!organization || (!isPublic && !canPreview)) throw notFound();

  const [listings, collectionRows] = await Promise.all([
    prisma.organizationPoster.findMany({
      where: { organizationId: organization.id, poster: { tombstone: false } },
      select: { posterId: true, created: true },
    }),
    // Public collections only, even for members, so the preview matches what
    // visitors see. Members manage the rest on the Collections tab.
    prisma.collection.findMany({
      where: {
        ...publicCollectionWhere,
        organizationListings: { some: { organizationId: organization.id } },
      },
      orderBy: { updated: "desc" },
      select: collectionSummarySelect,
    }),
  ]);
  const listedAt = new Map(
    listings.map((listing) => [listing.posterId, listing.created]),
  );

  const latestByRoot = await latestPublicPosterVersions([...listedAt.keys()]);

  const posters = [...latestByRoot.entries()]
    .map(([rootId, version]) =>
      toProfilePosterCard(
        version,
        // Auto-indexed posters reach an organization through a member's claim.
        version.automated ? "author" : "publisher",
        listedAt.get(rootId) ?? null,
      ),
    )
    .sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );

  return {
    // Only people who can manage or moderate the page need the internal id.
    id: canPreview ? organization.id : null,
    path: organizationPath(organization.profileId),
    avatarUrl: organizationAvatarUrl(organization.profileId),
    name: organization.name,
    description: organization.description,
    websiteUrl: organization.websiteUrl,
    role: membership?.role ?? null,
    // A count only, never names. Members and admins see it even when an owner
    // has hidden it from visitors.
    memberCount:
      organization.showMemberCount || canPreview
        ? organization._count.members
        : null,
    showMemberCount: organization.showMemberCount,
    isPublic,
    isHidden,
    hiddenReason: canPreview ? organization.hiddenReason : "",
    posters,
    collections: await toCollectionSummaries(collectionRows),
    searchMatches: await matchProfilePosterSearch(
      getQuery(event).search,
      posters,
    ),
  };
});
