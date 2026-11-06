/**
 * The signed-in person's organizations and which of them show this poster.
 * Any version id works. Listings are stored against the version root.
 */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const rootId = await resolvePosterRootId(getRouterParam(event, "id"));

  return posterOrganizationChoices(session.user.id, rootId);
});
