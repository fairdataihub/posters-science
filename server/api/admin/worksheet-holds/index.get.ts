import { holdReason } from "~~/server/utils/bulkWorksheetHold";

/** Batches with a worksheet hold, oldest first. */
export default defineEventHandler(async (event) => {
  await requireAdminSession(event);
  setResponseHeader(event, "Cache-Control", "no-store");

  const holds = await prisma.bulkSubmission.findMany({
    where: { worksheetHeldAt: { not: null } },
    orderBy: { worksheetHeldAt: "asc" },
    select: {
      id: true,
      name: true,
      worksheetHeldAt: true,
      worksheetHoldFiles: true,
      worksheetHoldReason: true,
      worksheetHoldPlatform: true,
      worksheetHoldProblems: true,
      worksheetHoldEmail: true,
      user: {
        select: { givenName: true, familyName: true, emailAddress: true },
      },
    },
    take: 200,
  });

  return {
    data: holds.map((hold) => ({
      jobId: hold.id,
      name: hold.name,
      heldAt: hold.worksheetHeldAt!.toISOString(),
      kind: holdReason(hold.worksheetHoldReason),
      platform: hold.worksheetHoldPlatform,
      problems: hold.worksheetHoldProblems,
      files: hold.worksheetHoldFiles,
      // The address they confirmed when sending, else the account's.
      contactEmail: hold.worksheetHoldEmail || hold.user.emailAddress,
      user: hold.user,
    })),
  };
});
