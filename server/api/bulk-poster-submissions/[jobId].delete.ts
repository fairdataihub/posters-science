import {
  bulkImportFolderExtension,
  bulkImportJobPrefix,
} from "~~/server/utils/bulkImportBunnyPaths";
import { deleteBunnyBulkImportJobFolder } from "~~/server/utils/bulkImportBunnyDelete";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

const DELETABLE_BULK_JOB_STATUSES = new Set(["draft", "failed"]);

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
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

  if (!DELETABLE_BULK_JOB_STATUSES.has(job.status)) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "Only draft or failed bulk imports can be deleted. Wait for processing to finish or contact support.",
    });
  }

  const config = useRuntimeConfig();
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;
  const siteEnv = config.siteEnv || config.public.siteEnv;
  const folderExtension = bulkImportFolderExtension(siteEnv);
  const jobPrefix = bulkImportJobPrefix(folderExtension, jobId);

  if (bunnyPrivateStorage && bunnyPrivateStorageKey) {
    await deleteBunnyBulkImportJobFolder({
      bunnyPrivateStorage,
      bunnyPrivateStorageKey,
      jobPrefix,
    });
  }

  await repository.deleteForUser(jobId, session.user.id);

  return { success: true };
});
