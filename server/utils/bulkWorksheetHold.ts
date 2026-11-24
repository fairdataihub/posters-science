import type {
  HeldPoster,
  WorksheetHoldReason,
} from "#shared/types/bulkWorksheetHold";
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

/** Reads the stored held posters, skipping anything malformed. */
export function parseHeldPosters(value: unknown): HeldPoster[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is HeldPoster =>
      !!item &&
      typeof item === "object" &&
      Number.isInteger((item as HeldPoster).posterId) &&
      typeof (item as HeldPoster).fileName === "string" &&
      ((item as HeldPoster).reason === "no_row" ||
        (item as HeldPoster).reason === "unlinked"),
  );
}

/** Posters held from Review can't be published until the hold is released. */
export async function assertPosterNotHeld(userId: string, posterId: number) {
  const held = await prisma.bulkSubmission.findMany({
    where: { userId, postersHeldAt: { not: null } },
    select: { heldPosters: true },
  });
  const isHeld = held.some((job) =>
    parseHeldPosters(job.heldPosters).some((p) => p.posterId === posterId),
  );
  if (isHeld) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "We're setting up this poster's details. You can publish it once we've emailed you.",
    });
  }
}

/** The hold shown on a batch's dashboard card, or null when it isn't held. */
export function dashboardHold(bulk: {
  worksheetHeldAt: Date | null;
  worksheetHoldReason: string | null;
  worksheetHoldPlatform: string | null;
  postersHeldAt: Date | null;
  heldPosters: unknown;
}) {
  if (bulk.worksheetHeldAt) {
    return {
      kind: holdReason(bulk.worksheetHoldReason),
      platform: bulk.worksheetHoldPlatform,
      posterCount: 0,
    };
  }
  if (bulk.postersHeldAt) {
    return {
      kind: "posters" as const,
      platform: null,
      posterCount: parseHeldPosters(bulk.heldPosters).length,
    };
  }

  return null;
}
