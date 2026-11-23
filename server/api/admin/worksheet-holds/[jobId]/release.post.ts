/**
 * Release a worksheet hold: the batch can leave its first step again, where
 * the organizer adds their worksheet again (under a format added since, or a
 * file the team fixed for them). The app sends no email; the team does.
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
    data: { worksheetHeldAt: null },
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
      files: job.worksheetHoldFiles,
    },
  });

  return { success: true };
});
