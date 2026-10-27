import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import {
  bulkImportFolderExtension,
  bulkImportPostersPrefix,
  isBulkImportPosterObjectPath,
} from "~~/server/utils/bulkImportBunnyPaths";
import { deleteBunnyPosterObjectFolder } from "~~/server/utils/bulkImportBunnyDelete";
import { listBunnyStorageObjects } from "~~/server/utils/bunnyStorageList";
import { removePostersFromBulkImportJob } from "~~/server/utils/bulkImportRemovePoster";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

function posterFolderPathFromObjectPath(objectPath: string) {
  const lastSlash = objectPath.lastIndexOf("/");
  if (lastSlash < 0) return null;
  return objectPath.substring(0, lastSlash + 1);
}

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

  const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  const created = summary.createdPosters ?? [];
  const staged = job.stagedPosters ?? [];

  const specs = [
    ...created.map((entry) => ({ posterId: entry.posterId })),
    ...staged
      .filter(
        (poster) =>
          !created.some((entry) => entry.filePath === poster.filePath),
      )
      .map((poster) => ({ filePath: poster.filePath })),
  ];

  let jobAfterRemoval = job;
  let removedFromJob = 0;

  if (specs.length > 0) {
    const removalResult = await removePostersFromBulkImportJob(
      session.user.id,
      jobId,
      specs,
    );
    jobAfterRemoval = removalResult.job;
    removedFromJob = removalResult.removedCount;
  }

  const config = useRuntimeConfig();
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;
  const siteEnv = config.siteEnv || config.public.siteEnv;
  const folderExtension = bulkImportFolderExtension(siteEnv);
  const postersPrefix = bulkImportPostersPrefix(folderExtension, jobId);
  const postersListPrefix = postersPrefix.replace(/\/$/, "");

  let deletedCount = removedFromJob;

  if (bunnyPrivateStorage && bunnyPrivateStorageKey) {
    const storedObjects = await listBunnyStorageObjects(
      bunnyPrivateStorage,
      bunnyPrivateStorageKey,
      postersListPrefix,
    );

    for (const object of storedObjects) {
      if (
        !isBulkImportPosterObjectPath(object.path, folderExtension, jobId)
      ) {
        continue;
      }
      const folder = posterFolderPathFromObjectPath(object.path);
      if (!folder) continue;

      await deleteBunnyPosterObjectFolder({
        bunnyPrivateStorage,
        bunnyPrivateStorageKey,
        filePath: object.path,
      });
      deletedCount += 1;
    }
  }

  const summaryAfterRemoval = (jobAfterRemoval.submissionSummary ??
    {}) as BulkImportSubmissionSummary;

  const updated = await repository.updateForUser(jobId, session.user.id, {
    stagedPosters: [],
    posterCount: 0,
    submissionSummary: {
      ...summaryAfterRemoval,
      createdPosters: [],
      createdPosterIds: [],
      licenseSpreadsheetRows: [],
    },
  });

  return { job: updated, deletedCount };
});
