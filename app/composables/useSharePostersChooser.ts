/** Shared open state for the individual vs bulk share chooser modal. */
export function useSharePostersChooser() {
  const open = useState("sharePostersChooserOpen", () => false);

  function openSharePostersChooser() {
    open.value = true;
  }

  function closeSharePostersChooser() {
    open.value = false;
  }

  function goShareIndividualPoster() {
    closeSharePostersChooser();
    void navigateTo("/share/new");
  }

  function goSharePosterBatch() {
    closeSharePostersChooser();
    void navigateTo("/share/new-bulk");
  }

  return {
    open,
    openSharePostersChooser,
    closeSharePostersChooser,
    goShareIndividualPoster,
    goSharePosterBatch,
  };
}
