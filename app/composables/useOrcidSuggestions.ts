import type { OrcidSuggestions } from "#shared/types/orcidSuggestions";
import type { DashboardView } from "~/types/dashboard";

/**
 * The auto-indexed posters that list the user's ORCID iD. One shared fetch,
 * so the sidebar's Suggested link and the dashboard agree after a claim.
 * Fetched in the browser so no page waits on the search.
 */
export function useOrcidSuggestions() {
  return useFetch<OrcidSuggestions>("/api/user/orcid-suggestions", {
    key: "orcid-suggestions",
    server: false,
    lazy: true,
  });
}

/**
 * The view the dashboard has open, for the sidebar to mark. The dashboard
 * can open on a default view with no ?tab, so the URL alone can't say.
 * Null on every other page.
 */
export function useOpenDashboardView() {
  return useState<DashboardView | null>("open-dashboard-view", () => null);
}
