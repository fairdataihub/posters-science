import type {
  MyOrganizationListings,
  OrganizationRole,
} from "#shared/types/organization";
import {
  organizationAvatarUrl,
  organizationPath,
} from "#shared/utils/organization";

/**
 * For the dashboard: the signed-in person's organizations, and which of them
 * show each of the posters the person published or claimed. Organizations
 * they left are included while they still show a poster the person added.
 */
export default defineEventHandler(
  async (event): Promise<MyOrganizationListings> => {
    const session = await requireDbUserSession(event);
    const userId = session.user.id;

    const organizationSelect = { id: true, profileId: true, name: true };

    const [memberships, formerListings] = await Promise.all([
      prisma.organizationMember.findMany({
        where: { userId },
        orderBy: { created: "asc" },
        select: { role: true, organization: { select: organizationSelect } },
      }),
      prisma.organizationPoster.findMany({
        where: {
          addedById: userId,
          organization: { members: { none: { userId } } },
        },
        orderBy: { created: "asc" },
        select: { organization: { select: organizationSelect } },
      }),
    ]);

    const organizations = new Map<
      string,
      MyOrganizationListings["organizations"][number]
    >();
    const describe = (
      organization: { id: string; profileId: string; name: string },
      role: OrganizationRole | null,
    ) => ({
      id: organization.id,
      name: organization.name,
      path: organizationPath(organization.profileId),
      avatarUrl: organizationAvatarUrl(organization.profileId),
      role,
    });

    for (const { role, organization } of memberships) {
      organizations.set(
        organization.id,
        describe(organization, role as OrganizationRole),
      );
    }

    for (const { organization } of formerListings) {
      if (!organizations.has(organization.id)) {
        organizations.set(organization.id, describe(organization, null));
      }
    }

    if (organizations.size === 0) return { organizations: [], listings: [] };

    const mine = await listablePosterRoots(userId);

    const listings =
      mine.size === 0
        ? []
        : await prisma.organizationPoster.findMany({
            where: {
              organizationId: { in: [...organizations.keys()] },
              posterId: { in: [...mine.keys()] },
            },
            select: { organizationId: true, posterId: true },
          });

    return { organizations: [...organizations.values()], listings };
  },
);
