import type { WorksheetHoldReason } from "#shared/types/bulkWorksheetHold";
import prisma from "~~/server/utils/prisma";

/**
 * Worksheet hold: the organizer sent a refused worksheet to the team, so the
 * batch stays on the first step until an admin releases it. Refuses anything
 * that moves the batch on. Skipped with the in-memory job repository (tests),
 * which has no database to hold the flag.
 */
export async function assertWorksheetNotHeld(jobId: string) {
  if (process.env.BULK_SUBMISSION_REPOSITORY === "mock") return;

  const record = await prisma.bulkSubmission.findUnique({
    where: { id: jobId },
    select: { worksheetHeldAt: true },
  });
  if (record?.worksheetHeldAt) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "We're setting up your worksheet. You can continue once it's ready.",
    });
  }
}

/** Holds saved before the reason was stored were worksheet errors. */
export function holdReason(value: string | null): WorksheetHoldReason {
  return value === "unsupported_platform" ? value : "worksheet_error";
}

/** The hold shown on a batch's dashboard card, or null when it isn't held. */
export function dashboardHold(bulk: {
  worksheetHeldAt: Date | null;
  worksheetHoldReason: string | null;
  worksheetHoldPlatform: string | null;
}) {
  if (bulk.worksheetHeldAt) {
    return {
      kind: holdReason(bulk.worksheetHoldReason),
      platform: bulk.worksheetHoldPlatform,
    };
  }

  return null;
}
