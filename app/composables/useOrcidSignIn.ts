import type { OrcidIntent } from "#shared/utils/orcidSignIn";

/**
 * Whether Sign in with ORCID can be offered here, and the link that starts it.
 * Hidden when the site has no ORCID settings, disabled while an admin has
 * paused it.
 */
export function useOrcidSignIn() {
  const { data } = useFetch<{ orcid: boolean }>("/api/auth/providers", {
    key: "auth-providers",
    default: () => ({ orcid: false }),
  });
  const { isActive, messageFor } = useMaintenance();

  const available = computed(() => data.value?.orcid ?? false);
  const paused = computed(() => isActive("orcidSignIn"));
  const pausedMessage = computed(() => messageFor("orcidSignIn"));

  function startUrl(
    intent: OrcidIntent,
    options: { redirect?: string; email?: string } = {},
  ) {
    const params = new URLSearchParams({ intent });

    if (options.redirect) params.set("redirect", options.redirect);
    if (options.email) params.set("email", options.email);

    return `/api/auth/orcid?${params.toString()}`;
  }

  return { available, paused, pausedMessage, startUrl };
}
