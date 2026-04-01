export default defineEventHandler(async () => {
  const manual = await prisma.poster.count({
    where: {
      status: "published",
      automated: false,
    },
  });

  const automation = await prisma.poster.count({
    where: {
      status: "published",
      automated: true,
    },
  });

  return {
    sharedViaPlatformCount: manual,
    indexedViaAutomationCount: automation,
  };
});
