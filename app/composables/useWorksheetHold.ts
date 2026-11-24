import type {
  HeldPoster,
  WorksheetHoldStatus,
} from "#shared/types/bulkWorksheetHold";

/** A batch's worksheet holds, shared across the wizard steps. */
export function useWorksheetHold(jobId: MaybeRefOrGetter<string | null>) {
  const state = useState<Record<string, WorksheetHoldStatus>>(
    "worksheet-holds",
    () => ({}),
  );
  const status = computed<WorksheetHoldStatus>(() => {
    const id = toValue(jobId);

    return (
      (id && state.value[id]) || {
        heldAt: null,
        heldReason: null,
        heldPlatform: null,
        postersHeldAt: null,
        heldPosters: [],
      }
    );
  });
  const heldPosterIds = computed(
    () => new Set(status.value.heldPosters.map((poster) => poster.posterId)),
  );

  async function load() {
    const id = toValue(jobId);
    if (!id) return;
    try {
      const next = await $fetch<WorksheetHoldStatus>(
        `/api/bulk-poster-submissions/${id}/platform-request`,
      );
      state.value = { ...state.value, [id]: next };
    } catch {
      // Not loaded: keep what we have; the server still enforces the holds.
    }
  }

  /** Send posters without a worksheet row to the team (the partial hold). */
  async function holdPosters(body: {
    posters: HeldPoster[];
    sheetFileName?: string;
    unmatchedRows?: string[];
  }) {
    const id = toValue(jobId);
    if (!id) return;
    const result = await $fetch<{
      postersHeldAt: string;
      heldPosters: HeldPoster[];
    }>(`/api/bulk-poster-submissions/${id}/held-posters`, {
      method: "POST",
      body,
    });
    state.value = {
      ...state.value,
      [id]: { ...status.value, ...result },
    };
  }

  return { status, heldPosterIds, load, holdPosters };
}
