import { readBody } from "h3";
import { applyBulkSubmissionMetadataToPosters } from "~~/server/utils/bulkImportPosterMetadata";

type ApplyBulkMetadataBody = {
  posterId?: number;
};

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const body = await readBody<ApplyBulkMetadataBody>(event);
  const posterId =
    body?.posterId != null && Number.isFinite(body.posterId)
      ? Number(body.posterId)
      : undefined;

  return await applyBulkSubmissionMetadataToPosters(
    session.user.id,
    jobId,
    posterId,
  );
});
