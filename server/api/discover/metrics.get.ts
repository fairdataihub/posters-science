import {
  computeMetrics,
  getLatestMetricsSnapshot,
} from "../../utils/computeMetrics";

// Serve the latest precomputed metrics snapshot (a cheap single-row read).
// Snapshots are refreshed by scripts/compute-metrics-snapshot.ts via
// .github/workflows/metrics-snapshot.yml. Before the first snapshot exists (e.g.
// a fresh deploy) we compute it live once so the page is never empty.
export default defineEventHandler(async () => {
  const snapshot = await getLatestMetricsSnapshot(prisma);

  if (snapshot) {
    return { ...snapshot.payload, generatedAt: snapshot.generatedAt };
  }

  // No snapshot yet: compute live this once.
  const payload = await computeMetrics(prisma);

  return { ...payload, generatedAt: new Date() };
});
