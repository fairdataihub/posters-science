/** Navigation helpers for the individual vs bulk share chooser page. */
export function useSharePostersChooser() {
  function openSharePostersChooser() {
    void navigateTo("/share");
  }

  function goShareIndividualPoster() {
    void navigateTo("/share/new");
  }

  function goSharePosterBatch() {
    void navigateTo("/share/new-bulk");
  }

  return {
    openSharePostersChooser,
    goShareIndividualPoster,
    goSharePosterBatch,
  };
}
