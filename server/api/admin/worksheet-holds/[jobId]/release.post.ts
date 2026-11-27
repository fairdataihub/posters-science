/**
 * Releases a batch's worksheet hold. The organizer isn't emailed by the
 * app; we email them ourselves.
 */
export default defineEventHandler(async (event) => {
  const session = await requireAdminSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "Invalid batch id" });
  }

  const job = await prisma.bulkSubmission.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      name: true,
      worksheetHeldAt: true,
      worksheetHoldFiles: true,
      worksheetHoldReason: true,
      worksheetHoldPlatform: true,
      user: { select: { emailAddress: true } },
    },
  });

  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Batch not found" });
  }
  if (!job.worksheetHeldAt) {
    throw createError({
      statusCode: 409,
      statusMessage: "This batch is not on hold",
    });
  }

  await prisma.bulkSubmission.update({
    where: { id: job.id },
    data: {
      worksheetHeldAt: null,
      worksheetHoldReason: null,
      worksheetHoldPlatform: null,
      worksheetHoldProblems: [],
      worksheetHoldEmail: null,
    },
  });

  await logAdminAction({
    adminUserId: session.user.id,
    action: "RELEASE_WORKSHEET_HOLD",
    entityType: "bulk_submission",
    entityId: job.id,
    details: {
      batchName: job.name,
      organizerEmail: job.user.emailAddress,
      heldAt: job.worksheetHeldAt,
      reason: job.worksheetHoldReason,
      platform: job.worksheetHoldPlatform,
      files: job.worksheetHoldFiles,
    },
  });

  return { success: true };
});
