/**
 * Bulk batches on a worksheet hold, oldest first: the organizer sent a
 * refused poster worksheet to the team ("Send it to us"), and the batch waits
 * on its first step until an admin releases it. Files are Bunny paths.
 */
export default defineEventHandler(async (event) => {
  await requireAdminSession(event);
  setResponseHeader(event, "Cache-Control", "no-store");

  const holds = await prisma.bulkSubmission.findMany({
    where: { worksheetHeldAt: { not: null } },
    select: {
      id: true,
      name: true,
      worksheetHeldAt: true,
      worksheetHoldFiles: true,
      user: {
        select: { givenName: true, familyName: true, emailAddress: true },
      },
    },
    orderBy: { worksheetHeldAt: "asc" },
    take: 200,
  });

  return {
    data: holds.map((hold) => ({
      jobId: hold.id,
      name: hold.name,
      heldAt: hold.worksheetHeldAt!.toISOString(),
      files: hold.worksheetHoldFiles,
      user: hold.user,
    })),
  };
});
