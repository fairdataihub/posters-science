import type { PosterCollectionChoices } from "#shared/types/collection";

/** Opens the "Collections" pop-up for one poster. */
export function useCollectionPosterPrompt() {
  const open = ref(false);
  const choices = ref<PosterCollectionChoices | null>(null);
  const loadingPosterId = ref<number | null>(null);

  async function show(posterId: number) {
    loadingPosterId.value = posterId;

    try {
      choices.value = await $fetch<PosterCollectionChoices>(
        `/api/poster/${posterId}/collections`,
      );
      open.value = true;
    } finally {
      loadingPosterId.value = null;
    }
  }

  return { open, choices, loadingPosterId, show };
}
