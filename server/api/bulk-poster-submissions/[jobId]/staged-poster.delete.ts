import { removeBulkImportPosterByFilePath } from "~~/server/utils/bulkImportRemovePoster";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const body = await readBody<{ filePath?: string }>(event);
  const filePath = body?.filePath?.trim();

  if (!filePath) {
    throw createError({
      statusCode: 400,
      statusMessage: "filePath is required",
    });
  }

  const result = await removeBulkImportPosterByFilePath(
    session.user.id,
    jobId,
    filePath,
  );

  return { job: result.job };
});
