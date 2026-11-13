import { Prisma } from "#shared/generated/client";
import prisma from "~~/server/utils/prisma";
import { requirePosterSheetJob } from "~~/server/utils/bulkPosterSheetPending";

/** Forget this batch's pending poster sheet (removed, or everything saved and checked). */
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const job = await requirePosterSheetJob(event);
  await prisma.bulkSubmission.update({
    where: { id: job.id },
    data: { posterSheet: Prisma.DbNull },
  });

  return { ok: true };
});
