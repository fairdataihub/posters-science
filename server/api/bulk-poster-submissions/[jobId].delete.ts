import {
  bulkImportFolderExtension,
  bulkImportJobPrefix,
} from "~~/server/utils/bulkImportBunnyPaths";
import { deleteBunnyBulkImportJobFolder } from "~~/server/utils/bulkImportBunnyDelete";
import {
  posterIdsFromBulkSubmissionSummary,
  posterIdsWithActiveExtractionJob,
} from "~~/server/utils/bulkImportDashboard";
import { deleteUserDraftPoster } from "~~/server/utils/deleteUserDraftPoster";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

const DELETABLE_BULK_JOB_STATUSES = new Set(["draft", "failed", "processing"]);

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
        "This bulk import cannot be deleted. Wait for processing to finish or contact support.",
    });
  }

  const linkedPosterIds = posterIdsFromBulkSubmissionSummary(
    job.submissionSummary,
  );

  if (job.status === "processing") {
    const activePosterIds =
      await posterIdsWithActiveExtractionJob(linkedPosterIds);

    if (activePosterIds.size > 0) {
      throw createError({
        statusCode: 409,
        statusMessage:
          "This bulk import cannot be deleted while metadata extraction is still running.",
      });
    }
  }

  let keptPublishedPosterCount = 0;

  for (const posterId of linkedPosterIds) {
    const result = await deleteUserDraftPoster(session.user.id, posterId);

    if (result.reason === "published" || result.reason === "zenodo_published") {
      keptPublishedPosterCount += 1;
      continue;
    }

    if (result.reason === "version_extraction_active") {
      throw createError({
        statusCode: 409,
        statusMessage:
          "This bulk import cannot be deleted while metadata extraction is still running.",
      });
    }
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

  return { success: true, keptPublishedPosterCount };
});
