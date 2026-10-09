import {
  bulkImportFolderExtension,
  isBulkImportPosterObjectPath,
} from "~~/server/utils/bulkImportBunnyPaths";
import { deleteBunnyPosterObjectFolder } from "~~/server/utils/bulkImportBunnyDelete";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

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

  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, session.user.id);

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  const staged = job.stagedPosters ?? [];
  const target = staged.find((poster) => poster.filePath === filePath);

  if (!target) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster file not found in this import",
    });
  }

  const config = useRuntimeConfig();
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;
  const siteEnv = config.siteEnv || config.public.siteEnv;
  const folderExtension = bulkImportFolderExtension(siteEnv);

  if (!isBulkImportPosterObjectPath(filePath, folderExtension, jobId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid file path",
    });
  }

  if (bunnyPrivateStorage && bunnyPrivateStorageKey) {
    await deleteBunnyPosterObjectFolder({
      bunnyPrivateStorage,
      bunnyPrivateStorageKey,
      filePath,
    });
  }

  const nextStaged = staged.filter((poster) => poster.filePath !== filePath);

  const updated = await repository.updateForUser(jobId, session.user.id, {
    stagedPosters: nextStaged,
    posterCount: nextStaged.length,
  });

  return { job: updated };
});
