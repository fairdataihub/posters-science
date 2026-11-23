import prisma from "~~/server/utils/prisma";
import { requirePosterSheetJob } from "~~/server/utils/bulkPosterSheetPending";

/**
 * Whether this batch's worksheet is with the team (the worksheet hold), and
 * since when. A held batch stays on the first step until an admin releases it.
 */
export default defineEventHandler(
  async (event): Promise<{ heldAt: string | null }> => {
    const job = await requirePosterSheetJob(event);
    setResponseHeader(event, "Cache-Control", "no-store");

    const record = await prisma.bulkSubmission.findUnique({
      where: { id: job.id },
      select: { worksheetHeldAt: true },
    });

    return { heldAt: record?.worksheetHeldAt?.toISOString() ?? null };
  },
);
