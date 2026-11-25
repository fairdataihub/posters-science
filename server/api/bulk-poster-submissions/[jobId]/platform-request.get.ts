import type { WorksheetHoldStatus } from "#shared/types/bulkWorksheetHold";
import prisma from "~~/server/utils/prisma";
import { requirePosterSheetJob } from "~~/server/utils/bulkPosterSheetPending";
import { holdReason } from "~~/server/utils/bulkWorksheetHold";

/** The batch's worksheet hold, if any. */
export default defineEventHandler(
  async (event): Promise<WorksheetHoldStatus> => {
    const job = await requirePosterSheetJob(event);
    setResponseHeader(event, "Cache-Control", "no-store");

    const record = await prisma.bulkSubmission.findUnique({
      where: { id: job.id },
      select: {
        worksheetHeldAt: true,
        worksheetHoldReason: true,
        worksheetHoldPlatform: true,
      },
    });

    return {
      heldAt: record?.worksheetHeldAt?.toISOString() ?? null,
      heldReason: record?.worksheetHeldAt
        ? holdReason(record.worksheetHoldReason)
        : null,
      heldPlatform: record?.worksheetHeldAt
        ? (record.worksheetHoldPlatform ?? null)
        : null,
    };
  },
);
