import type { PendingPosterSheet } from "#shared/types/posterSheetMapping";
import prisma from "~~/server/utils/prisma";
import {
  isPendingPosterSheet,
  relinkPendingPosterSheet,
} from "#shared/utils/posterSheetRelink";
import { requirePosterSheetJob } from "~~/server/utils/bulkPosterSheetPending";

/**
 * The confirmed poster sheet waiting on this batch, or null. Rows mapped
 * against file names still uploading at the time are re-linked here to the
 * stored file names, and the re-linked sheet is saved back.
 */
export default defineEventHandler(
  async (event): Promise<{ pending: PendingPosterSheet | null }> => {
    const job = await requirePosterSheetJob(event);
    setResponseHeader(event, "Cache-Control", "no-store");

    const record = await prisma.bulkSubmission.findUnique({
      where: { id: job.id },
      select: { posterSheet: true },
    });
    const stored = record?.posterSheet;
    if (!isPendingPosterSheet(stored)) return { pending: null };

    const relinked = relinkPendingPosterSheet(
      stored,
      (job.stagedPosters ?? []).map((poster) => poster.fileName),
    );
    if (relinked !== stored) {
      await prisma.bulkSubmission.update({
        where: { id: job.id },
        data: { posterSheet: relinked as never },
      });
    }

    return { pending: relinked };
  },
);
