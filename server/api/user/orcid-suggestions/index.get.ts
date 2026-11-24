import type { OrcidSuggestions } from "#shared/types/orcidSuggestions";
import {
  matchingOrcidFor,
  orcidSuggestionCards,
  orcidSuggestionRootIds,
} from "../../../utils/orcidSuggestions";

/**
 * Auto-indexed posters that list the user's ORCID iD and that they haven't
 * claimed or marked "Not me", for the dashboard's Suggested tab. While the
 * tab is hidden only the count is returned, for the settings page.
 */
export default defineEventHandler(async (event): Promise<OrcidSuggestions> => {
  const session = await requireUserSession(event);
  const userId = session.user.id;

  const [{ orcid, source }, user, dismissedCount] = await Promise.all([
    matchingOrcidFor(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { orcidSuggestionsHidden: true },
    }),
    prisma.claimSuggestionDismissal.count({ where: { userId } }),
  ]);

  const hidden = user?.orcidSuggestionsHidden ?? false;
  const result: OrcidSuggestions = {
    orcid,
    source,
    hidden,
    dismissedCount,
    total: 0,
    suggestions: [],
  };

  if (!orcid) return result;

  const rootIds = await orcidSuggestionRootIds(userId, orcid);

  result.total = rootIds.length;

  if (!hidden && rootIds.length > 0) {
    result.suggestions = await orcidSuggestionCards(rootIds, orcid);
  }

  return result;
});
