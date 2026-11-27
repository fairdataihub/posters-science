/** Why a whole batch is held. */
export type WorksheetHoldReason = "unsupported_platform" | "worksheet_error";

/** GET /api/bulk-poster-submissions/:jobId/platform-request */
export type WorksheetHoldStatus = {
  /** The whole batch is held on the first step. */
  heldAt: string | null;
  heldReason: WorksheetHoldReason | null;
  heldPlatform: string | null;
};
