import type { MatchingOrcid } from "#shared/types/orcidSuggestions";
import { matchingOrcidFor } from "../../utils/orcidSuggestions";

/**
 * The signed-in user's ORCID iD for matching posters: the linked one, else
 * the typed one. Discover uses it for the "Posters with my ORCID iD" switch.
 */
export default defineEventHandler(async (event): Promise<MatchingOrcid> => {
  const session = await requireUserSession(event);

  return matchingOrcidFor(session.user.id);
});
