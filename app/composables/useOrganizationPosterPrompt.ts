import type { PosterOrganizationChoices } from "#shared/types/organization";

/**
 * Opens the "show on an organization page" modal for one poster. `offer` is for
 * the moments right after publishing or claiming, and does nothing for someone
 * who isn't in an organization or can't list the poster. `show` is for an
 * explicit click and always opens.
 */
export function useOrganizationPosterPrompt() {
  const open = ref(false);
  const choices = ref<PosterOrganizationChoices | null>(null);
  const loadingPosterId = ref<number | null>(null);

  async function load(posterId: number) {
    loadingPosterId.value = posterId;

    try {
      return await $fetch<PosterOrganizationChoices>(
        `/api/poster/${posterId}/organizations`,
      );
    } finally {
      loadingPosterId.value = null;
    }
  }

  async function offer(posterId: number): Promise<boolean> {
    try {
      const result = await load(posterId);

      if (!result.canList || result.organizations.length === 0) return false;

      choices.value = result;
      open.value = true;

      return true;
    } catch {
      // The prompt is optional, so a failed lookup just skips it.
      return false;
    }
  }

  async function show(posterId: number) {
    choices.value = await load(posterId);
    open.value = true;
  }

  return { open, choices, loadingPosterId, offer, show };
}
