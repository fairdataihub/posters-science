import { matchDashboardPublishedSearch } from "~~/server/utils/dashboardPublished";

/**
 * Searches the signed-in user's Published list on the dashboard with the
 * Discover search syntax. The posters come from the session alone: their own
 * latest published versions, retired ones included, and the posters they
 * claimed. Returns the matching version roots and bulk uploads.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { search } = getQuery(event);

  return matchDashboardPublishedSearch(
    user.id,
    typeof search === "string" ? search : "",
  );
});
