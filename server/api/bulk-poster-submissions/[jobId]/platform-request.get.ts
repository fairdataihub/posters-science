import prisma from "~~/server/utils/prisma";
import { requirePosterSheetJob } from "~~/server/utils/bulkPosterSheetPending";

/** Whether this batch has already sent its platform details to Slack. */
export default defineEventHandler(
  async (event): Promise<{ submitted: boolean }> => {
    const job = await requirePosterSheetJob(event);
    setResponseHeader(event, "Cache-Control", "no-store");

    const record = await prisma.bulkSubmission.findUnique({
      where: { id: job.id },
      select: { posterPlatformDetailsSubmittedToSlack: true },
    });

    return { submitted: !!record?.posterPlatformDetailsSubmittedToSlack };
  },
);
