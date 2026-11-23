import { submitBulkPosterSubmissionJob } from "~~/server/utils/bulkImportSubmit";
import { assertWorksheetNotHeld } from "~~/server/utils/bulkWorksheetHold";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  // A held batch can't start extraction until its worksheet is released.
  await assertWorksheetNotHeld(jobId);

  return await submitBulkPosterSubmissionJob(session.user.id, jobId);
});
