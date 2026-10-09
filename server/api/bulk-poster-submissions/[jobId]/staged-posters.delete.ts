import {
  bulkImportFolderExtension,
  bulkImportPostersPrefix,
  isBulkImportPosterObjectPath,
} from "~~/server/utils/bulkImportBunnyPaths";
import { deleteBunnyPosterObjectFolder } from "~~/server/utils/bulkImportBunnyDelete";
import { listBunnyStorageObjects } from "~~/server/utils/bunnyStorageList";
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

  const config = useRuntimeConfig();
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;
  const siteEnv = config.siteEnv || config.public.siteEnv;
  const folderExtension = bulkImportFolderExtension(siteEnv);
  const postersPrefix = bulkImportPostersPrefix(folderExtension, jobId);
  const postersListPrefix = postersPrefix.replace(/\/$/, "");

  const samplePathByFolder = new Map<string, string>();

  for (const poster of job.stagedPosters ?? []) {
    if (
      !isBulkImportPosterObjectPath(poster.filePath, folderExtension, jobId)
    ) {
      continue;
    }
    const folder = posterFolderPathFromObjectPath(poster.filePath);
    if (folder) samplePathByFolder.set(folder, poster.filePath);
  }

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
      if (folder && !samplePathByFolder.has(folder)) {
        samplePathByFolder.set(folder, object.path);
      }
    }

    for (const filePath of samplePathByFolder.values()) {
      await deleteBunnyPosterObjectFolder({
        bunnyPrivateStorage,
        bunnyPrivateStorageKey,
        filePath,
      });
    }
  }

  const deletedCount = samplePathByFolder.size;

  const updated = await repository.updateForUser(jobId, session.user.id, {
    stagedPosters: [],
    posterCount: 0,
  });

  return { job: updated, deletedCount };
});
