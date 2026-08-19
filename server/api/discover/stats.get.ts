export default defineEventHandler(async () => {
  const manual = await prisma.poster.count({
    where: {
      status: "published",
      tombstone: false,
      isLatestVersion: true,
      automated: false,
    },
  });

  const automation = await prisma.poster.count({
    where: {
      status: "published",
      tombstone: false,
      isLatestVersion: true,
      automated: true,
    },
  });

  return {
    sharedViaPlatformCount: manual,
    indexedViaAutomationCount: automation,
  };
});
