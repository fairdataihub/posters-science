import {
  holdReason,
  parseHeldPosters,
} from "~~/server/utils/bulkWorksheetHold";

/** Batches with a worksheet hold, oldest first. */
export default defineEventHandler(async (event) => {
  await requireAdminSession(event);
  setResponseHeader(event, "Cache-Control", "no-store");

  const holds = await prisma.bulkSubmission.findMany({
    where: {
      OR: [
        { worksheetHeldAt: { not: null } },
        { postersHeldAt: { not: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      worksheetHeldAt: true,
      worksheetHoldFiles: true,
      worksheetHoldReason: true,
      worksheetHoldPlatform: true,
      worksheetHoldProblems: true,
      worksheetHoldEmail: true,
      postersHeldAt: true,
      heldPosters: true,
      user: {
        select: { givenName: true, familyName: true, emailAddress: true },
      },
    },
    take: 200,
  });

  return {
    data: holds
      .map((hold) => ({
        jobId: hold.id,
        name: hold.name,
        heldAt: [hold.worksheetHeldAt, hold.postersHeldAt]
          .filter((date): date is Date => date !== null)
          .sort((a, b) => a.getTime() - b.getTime())[0]!
          .toISOString(),
        batchHeld: hold.worksheetHeldAt !== null,
        kind: hold.worksheetHeldAt
          ? holdReason(hold.worksheetHoldReason)
          : "posters_unmatched",
        platform: hold.worksheetHoldPlatform,
        problems: hold.worksheetHeldAt ? hold.worksheetHoldProblems : [],
        files: hold.worksheetHoldFiles,
        posters: hold.postersHeldAt ? parseHeldPosters(hold.heldPosters) : [],
        // The address they confirmed when sending, else the account's.
        contactEmail:
          (hold.worksheetHeldAt && hold.worksheetHoldEmail) ||
          hold.user.emailAddress,
        user: hold.user,
      }))
      .sort((a, b) => a.heldAt.localeCompare(b.heldAt)),
  };
});
