/** A poster held at Review because no worksheet row matched it. */
export type HeldPoster = {
  posterId: number;
  fileName: string;
  reason: "no_row" | "unlinked";
};

/** Why a whole batch is held. */
export type WorksheetHoldReason = "unsupported_platform" | "worksheet_error";

/** GET /api/bulk-poster-submissions/:jobId/platform-request */
export type WorksheetHoldStatus = {
  /** The whole batch is held on the first step. */
  heldAt: string | null;
  heldReason: WorksheetHoldReason | null;
  heldPlatform: string | null;
  /** Some posters are held from publishing. */
  postersHeldAt: string | null;
  heldPosters: HeldPoster[];
};
