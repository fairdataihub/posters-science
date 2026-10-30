import { buildBulkSubmissionCompletion } from "~~/server/utils/bulkImportZenodoBatchCompletion";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const config = useRuntimeConfig();
  const siteEnv = config.siteEnv || config.public.siteEnv;

  const completion = await buildBulkSubmissionCompletion(
    session.user.id,
    jobId,
    siteEnv,
  );

  if (!completion) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  return completion;
});
