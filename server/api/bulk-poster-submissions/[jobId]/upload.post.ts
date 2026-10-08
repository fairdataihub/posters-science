import {
  ALLOWED_POSTER_FILE_LABEL,
  isAllowedPosterFile,
  MAX_POSTER_FILE_SIZE_BYTES,
  MAX_POSTER_FILE_SIZE_LABEL,
} from "#shared/utils/posterFile";
import { CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME } from "#shared/types/conferenceBulkImport";
import type { BulkImportStagedPoster } from "#shared/types/bulkPosterSubmissionJob";
import {
  bulkImportFolderExtension,
  bulkImportLicenseMetadataObjectPath,
  bulkImportPosterObjectPath,
} from "~~/server/utils/bulkImportBunnyPaths";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

type BulkImportUploadRole = "poster" | "license_metadata";

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

  const role = (roleEntry?.data?.toString("utf8") ??
    "poster") as BulkImportUploadRole;

  if (role !== "poster" && role !== "license_metadata") {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid upload role",
    });
  }

  if (fileEntry.data.length > MAX_POSTER_FILE_SIZE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "File too large",
      message: `File must be ${MAX_POSTER_FILE_SIZE_LABEL} or smaller`,
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

  if (role === "poster") {
    const fileName = fileEntry.filename;
    const fileType = fileEntry.type || "application/pdf";

    if (!isAllowedPosterFile(fileName, fileType)) {
      throw createError({
        statusCode: 415,
        statusMessage: "Unsupported file type",
        message: `File must be a ${ALLOWED_POSTER_FILE_LABEL}`,
      });
    }

    const filePath = bulkImportPosterObjectPath(
      folderExtension,
      jobId,
      fileName,
    );

    await putOnBunny({
      bunnyPrivateStorage,
      bunnyPrivateStorageKey,
      filePath,
      body: fileEntry.data,
      contentType: fileType,
    });

    const staged: BulkImportStagedPoster = {
      fileName,
      filePath,
      uploadedAt,
    };

    const existing = job.stagedPosters ?? [];
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

    return {
      role,
      fileName,
      filePath,
      job: updated,
    };
  }

  const lowerName = fileEntry.filename.toLowerCase();
  if (!lowerName.endsWith(".csv")) {
    throw createError({
      statusCode: 415,
      statusMessage: "Unsupported metadata file",
      message: "Upload license metadata as a CSV file (.csv).",
    });
  }

  const metadataFileName = `${CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME}.csv`;
  const metadataPath = bulkImportLicenseMetadataObjectPath(
    folderExtension,
    jobId,
    CONFERENCE_BULK_IMPORT_LICENSE_METADATA_BASENAME,
  );

  await putOnBunny({
    bunnyPrivateStorage,
    bunnyPrivateStorageKey,
    filePath: metadataPath,
    body: fileEntry.data,
    contentType: "text/csv",
  });

  const updated = await repository.updateForUser(jobId, session.user.id, {
    licenseMetadataFileName: metadataFileName,
    licenseMetadataFilePath: metadataPath,
    wizardStep: "metadata",
  });

  return {
    role,
    fileName: metadataFileName,
    filePath: metadataPath,
    job: updated,
  };
});
