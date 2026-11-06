import type { MyOrganizationListings } from "#shared/types/organization";

type ListedOrganization = MyOrganizationListings["organizations"][number];

/**
 * Which of the signed-in person's organizations show each of their posters,
 * for badges on the dashboard. Lazy, so it never holds up the poster list.
 */
export function useOrganizationListings() {
  const { data, refresh } = useFetch<MyOrganizationListings>(
    "/api/organizations/listings",
    {
      key: "organization-listings",
      lazy: true,
      default: () => ({ organizations: [], listings: [] }),
    },
  );

  const byPoster = computed(() => {
    const organizations = new Map(
      data.value.organizations.map((org) => [org.id, org]),
    );
    const listed = new Map<number, ListedOrganization[]>();

    for (const listing of data.value.listings) {
      const organization = organizations.get(listing.organizationId);

      if (!organization) continue;

      listed.set(listing.posterId, [
        ...(listed.get(listing.posterId) ?? []),
        organization,
      ]);
    }

    return listed;
  });

  const hasOrganizations = computed(() => data.value.organizations.length > 0);

  function listedOn(posterId: number) {
    return byPoster.value.get(posterId) ?? [];
  }

  return { hasOrganizations, listedOn, refresh };
}
