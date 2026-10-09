import type { BulkImportStagedPoster } from "#shared/types/bulkPosterSubmissionJob";
import {
  isAllowedPosterFile,
  MAX_POSTER_FILE_SIZE_BYTES,
} from "#shared/utils/posterFile";
import {
  bulkImportFolderExtension,
  bulkImportJobPrefix,
} from "~~/server/utils/bulkImportBunnyPaths";
import { listBunnyStorageObjects } from "~~/server/utils/bunnyStorageList";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

function fileNameFromObjectPath(filePath: string) {
  const segments = filePath.split("/");
  return segments[segments.length - 1] ?? filePath;
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

  if (!bunnyPrivateStorage || !bunnyPrivateStorageKey) {
    return { stagedPosters: job.stagedPosters, syncedFromStorage: false };
  }

  const folderExtension = bulkImportFolderExtension(siteEnv);
  const postersPrefix = `${bulkImportJobPrefix(folderExtension, jobId)}/posters`;

  const storedObjects = await listBunnyStorageObjects(
    bunnyPrivateStorage,
    bunnyPrivateStorageKey,
    postersPrefix,
  );

  const posterPaths = storedObjects
    .filter((object) => {
      const fileName = fileNameFromObjectPath(object.path);
      if (!isAllowedPosterFile(fileName, "")) return false;
      if (object.length > MAX_POSTER_FILE_SIZE_BYTES) return false;
      if (object.length === 0) return false;
      return true;
    })
    .map((object) => object.path);

  const previousByPath = new Map(
    job.stagedPosters.map((poster) => [poster.filePath, poster]),
  );

  const staged: BulkImportStagedPoster[] = posterPaths.map((filePath) => {
    const existing = previousByPath.get(filePath);
    const fileName = existing?.fileName ?? fileNameFromObjectPath(filePath);

    return {
      fileName,
      filePath,
      uploadedAt: existing?.uploadedAt ?? new Date().toISOString(),
    };
  });

  staged.sort((a, b) =>
    a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" }),
  );

  const updated = await repository.updateForUser(jobId, session.user.id, {
    stagedPosters: staged,
    posterCount: staged.length,
  });

  return {
    stagedPosters: updated.stagedPosters,
    syncedFromStorage: true,
  };
});
