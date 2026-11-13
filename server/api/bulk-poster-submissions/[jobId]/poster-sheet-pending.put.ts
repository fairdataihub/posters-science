import type { PendingPosterSheet } from "#shared/types/posterSheetMapping";
import prisma from "~~/server/utils/prisma";
import {
  isPendingPosterSheet,
  relinkPendingPosterSheet,
} from "#shared/utils/posterSheetRelink";
import {
  MAX_PENDING_SHEET_BYTES,
  requirePosterSheetJob,
} from "~~/server/utils/bulkPosterSheetPending";

/**
 * Save the confirmed poster sheet on this batch (rows still to save into the
 * grid, title matches, flags to check), so it survives a reload or another
 * device. The browser keeps a copy only as a cache.
 */
export default defineEventHandler(
  async (event): Promise<{ pending: PendingPosterSheet }> => {
    const job = await requirePosterSheetJob(event);
    const raw = await readRawBody(event, "utf8");
    if (!raw) {
      throw createError({
        statusCode: 400,
        statusMessage: "Sheet is required",
      });
    }
    if (Buffer.byteLength(raw, "utf8") > MAX_PENDING_SHEET_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: "Poster sheet is too large to keep",
      });
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw createError({ statusCode: 400, statusMessage: "Invalid sheet" });
    }
    if (!isPendingPosterSheet(body)) {
      throw createError({ statusCode: 400, statusMessage: "Invalid sheet" });
    }

    const pending = relinkPendingPosterSheet(
      body,
      (job.stagedPosters ?? []).map((poster) => poster.fileName),
    );
    await prisma.bulkSubmission.update({
      where: { id: job.id },
      data: { posterSheet: pending as never },
    });

    return { pending };
  },
);
