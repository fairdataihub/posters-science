import type { DashboardBulkSubmission } from "#shared/types/dashboardFeed";

export type DashboardBatchStatus =
  | "draft"
  | "extracting"
  | "review"
  | "ready"
  | "on_hold"
  | "failed";

export const DASHBOARD_BATCH_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "extracting", label: "Extracting metadata" },
  { value: "review", label: "Ready for review" },
  { value: "ready", label: "Ready to publish" },
  { value: "on_hold", label: "On hold" },
  { value: "failed", label: "Needs attention" },
] satisfies { value: DashboardBatchStatus; label: string }[];

/** Use the same workflow states on batch cards and in the status filter. */
export function dashboardBatchStatus(
  batch: DashboardBulkSubmission,
): DashboardBatchStatus {
  if (batch.status === "failed") return "failed";
  // Waiting on us: the batch is on a worksheet hold.
  if (batch.hold) return "on_hold";
  if (batch.status === "processing" && batch.hasActiveExtraction) {
    return "extracting";
  }
  if (["preview", "publish"].includes(batch.wizardStep)) return "ready";
  if (batch.status === "processing" || batch.wizardStep === "review") {
    return "review";
  }

  return "draft";
}

/** Count the cards and their contents separately, including mixed lists. */
export function dashboardResultSummary(
  individualCount: number,
  batchCount: number,
  batchPosterCount: number | null,
): string {
  const plural = (count: number, noun: string, pluralNoun = `${noun}s`) =>
    `${count.toLocaleString()} ${count === 1 ? noun : pluralNoun}`;

  if (!batchCount) return plural(individualCount, "poster");

  const batches =
    plural(batchCount, "batch", "batches") +
    (batchPosterCount === null
      ? ""
      : ` containing ${plural(batchPosterCount, "poster")}`);

  return individualCount
    ? `${plural(individualCount, "individual poster")} and ${batches}`
    : batches;
}
