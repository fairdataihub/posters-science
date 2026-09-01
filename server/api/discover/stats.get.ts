import { getLatestMetricsSnapshot } from "../../utils/computeMetrics";

export default defineEventHandler(async () => {
  const snapshot = await getLatestMetricsSnapshot(prisma);

  if (snapshot) {
    const { platform } = snapshot.payload;

    return {
      sharedViaPlatformCount: platform.manualCount,
      indexedViaAutomationCount: platform.automatedCount,
      generatedAt: snapshot.generatedAt,
    };
  }

  const [manual, automation] = await Promise.all([
    prisma.poster.count({
      where: {
        status: "published",
        tombstone: false,
        isLatestVersion: true,
        automated: false,
      },
    }),
    prisma.poster.count({
      where: {
        status: "published",
        tombstone: false,
        isLatestVersion: true,
        automated: true,
      },
    }),
  ]);

  return {
    sharedViaPlatformCount: manual,
    indexedViaAutomationCount: automation,
    generatedAt: new Date(),
  };
});
