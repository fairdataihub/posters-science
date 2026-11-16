import {
  MAX_POSTER_FILE_SIZE_BYTES,
  posterFileRejectionReason,
} from "#shared/utils/posterFile";
import { posterUploadBaseName } from "#shared/utils/bulkPosterUploadFileName";
import type { BulkImportStagedPoster } from "#shared/types/bulkPosterSubmissionJob";
import {
  bulkImportFolderExtension,
  bulkImportPosterObjectPath,
} from "~~/server/utils/bulkImportBunnyPaths";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { posterTitleFromFileName } from "~~/server/utils/bulkImportSubmit";
import { deleteUserDraftPoster } from "~~/server/utils/deleteUserDraftPoster";
import prisma from "~~/server/utils/prisma";

async function putOnBunny(input: {
  bunnyPrivateStorage: string;
  bunnyPrivateStorageKey: string;
  filePath: string;
  body: Buffer;
  contentType: string;
}) {
  const uploadUrl = `${input.bunnyPrivateStorage}/${input.filePath}`;
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: input.bunnyPrivateStorageKey,
      "Content-Type": input.contentType,
      "Content-Length": String(input.body.length),
    },
    body: input.body as BodyInit,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    console.error("Bunny bulk upload failed:", uploadResponse.status, text);
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to upload file to storage",
      message: `Bunny CDN returned ${uploadResponse.status}`,
    });
  }
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

  const config = useRuntimeConfig();
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;
  const siteEnv = config.siteEnv || config.public.siteEnv;

  if (!bunnyPrivateStorage || !bunnyPrivateStorageKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "Bunny storage not configured",
      message:
        "NUXT_BUNNY_PRIVATE_STORAGE and NUXT_BUNNY_PRIVATE_STORAGE_KEY must be set",
    });
  }

  const formData = await readMultipartFormData(event);

  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "No file provided",
    });
  }

  const fileEntry = formData.find(
    (entry) => entry.name === "file" && entry.filename,
  );
  const roleEntry = formData.find((entry) => entry.name === "role");

  if (!fileEntry?.data || !fileEntry.filename) {
    throw createError({
      statusCode: 400,
      statusMessage: "File not found in request",
    });
  }

  const role = roleEntry?.data?.toString("utf8") ?? "poster";

  if (role !== "poster") {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid upload role",
      message: "Only poster file uploads are supported.",
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

  const folderExtension = bulkImportFolderExtension(siteEnv);
  const uploadedAt = new Date().toISOString();

  const fileName = posterUploadBaseName(fileEntry.filename);
  const fileType = fileEntry.type || "application/pdf";

  const rejection = posterFileRejectionReason({
    name: fileName,
    type: fileType,
    size: fileEntry.data.length,
  });

  if (rejection) {
    const statusCode = fileEntry.data.length > MAX_POSTER_FILE_SIZE_BYTES
      ? 413
      : fileEntry.data.length === 0
        ? 400
        : 415;

    throw createError({
      statusCode,
      statusMessage:
        statusCode === 413
          ? "File too large"
          : statusCode === 415
            ? "Unsupported file type"
            : "Invalid file",
      message: rejection,
    });
  }

  // The job stays "staged" (ignored by the worker) until the import is submitted.
  const poster = await prisma.poster.create({
    data: {
      userId: session.user.id,
      title: posterTitleFromFileName(fileName),
      description: "",
      imageUrl: "",
      status: "draft",
    },
    select: { id: true },
  });

  const filePath = bulkImportPosterObjectPath(
    folderExtension,
    jobId,
    poster.id,
    fileName,
  );
  console.log(
    `[bulk-import/upload] job ${jobId} poster ${poster.id}: uploading to ${filePath}`,
  );

  try {
    await putOnBunny({
      bunnyPrivateStorage,
      bunnyPrivateStorageKey,
      filePath,
      body: fileEntry.data,
      contentType: fileType,
    });
    console.log(
      `[bulk-import/upload] job ${jobId} poster ${poster.id}: stored at ${filePath}`,
    );
    await prisma.extractionJob.create({
      data: { posterId: poster.id, fileName, filePath, status: "staged" },
    });
  } catch (error) {
    await prisma.poster.delete({ where: { id: poster.id } }).catch(() => {});
    throw error;
  }

  const staged: BulkImportStagedPoster = {
    fileName,
    filePath,
    uploadedAt,
    posterId: poster.id,
  };

  const existing = job.stagedPosters ?? [];
  const replaced = existing.find((item) => item.fileName === fileName);
  const nextStaged = [
    ...existing.filter((item) => item.fileName !== fileName),
    staged,
  ].sort((a, b) =>
    a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" }),
  );

  const updated = await repository.updateForUser(jobId, session.user.id, {
    stagedPosters: nextStaged,
    posterCount: nextStaged.length,
    wizardStep: "upload",
  });

  if (
    replaced?.posterId != null &&
    (await prisma.extractionJob.count({
      where: { posterId: replaced.posterId, status: "staged" },
    }))
  ) {
    await deleteUserDraftPoster(session.user.id, replaced.posterId);
  }

  return {
    role,
    fileName,
    filePath,
    job: updated,
  };
});
