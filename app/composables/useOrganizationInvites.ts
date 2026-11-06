import type { MyOrganizationInvite } from "#shared/types/organization";

/**
 * Invites waiting for the signed-in person. The dashboard banner and the
 * organizations page share one copy, so answering one updates both.
 *
 * Fetched in the browser only. When the next page mounts while the previous
 * one still holds this key, Nuxt hands it the first server-rendered result,
 * which brought back an invite that had already been accepted.
 */
export function useOrganizationInvites() {
  const { data, status, refresh } = useFetch<{
    invites: MyOrganizationInvite[];
  }>("/api/organizations/invites", {
    key: "organization-invites",
    lazy: true,
    server: false,
    default: () => ({ invites: [] }),
  });

  const invites = computed(() => data.value.invites);

  return { invites, status, refresh };
}
