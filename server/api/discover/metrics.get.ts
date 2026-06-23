import {
  computeMetrics,
  type MetricsPayload,
} from "../../utils/computeMetrics";

// Serve the latest precomputed metrics snapshot (a cheap single-row read).
// Snapshots are refreshed twice daily by scripts/compute-metrics-snapshot.ts via
// .github/workflows/metrics-snapshot.yml. Before the first snapshot exists (e.g.
// a fresh deploy) we compute it live once so the page is never empty.
export default defineEventHandler(async () => {
  const snapshot = await prisma.metricsSnapshot.findFirst({
    orderBy: { generatedAt: "desc" },
  });

  if (snapshot) {
    return {
      ...(snapshot.payload as MetricsPayload),
      generatedAt: snapshot.generatedAt,
    };
  }

  // No snapshot yet: compute live this once.
  const payload = await computeMetrics(prisma);

  return { ...payload, generatedAt: new Date() };
});
