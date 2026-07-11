export default defineEventHandler(async () => {
  const manual = await prisma.poster.count({
    where: {
      status: "published",
      tombstone: false,
      automated: false,
    },
  });

  const automation = await prisma.poster.count({
    where: {
      status: "published",
      tombstone: false,
      automated: true,
    },
  });

  return {
    sharedViaPlatformCount: manual,
    indexedViaAutomationCount: automation,
  };
});
