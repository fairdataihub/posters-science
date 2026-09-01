import { createId } from "@paralleldrive/cuid2";
import { normalizeVersionRelatedIdentifiers } from "../../../utils/posterVersions";

type Identifier = { identifier?: string; identifierType?: string };

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const GENERIC_UPLOAD_TYPES = new Set(["", "application/octet-stream"]);

function fieldValue(
  formData: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
) {
  const field = formData?.find(
    (entry) => entry.name === name && !entry.filename,
  );

  return field?.data.toString("utf8");
}

function isAllowedPosterFile(name: string, type: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const expectedType = ALLOWED_FILE_TYPES[extension];
  const normalizedType = type.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  return Boolean(
    expectedType &&
    (normalizedType === expectedType ||
      GENERIC_UPLOAD_TYPES.has(normalizedType)),
  );
}

function isVersionReviewReady(
  imageUrl: string,
  extractionJob: { status: string; completed: boolean } | null | undefined,
) {
  return Boolean(
    imageUrl &&
    (!extractionJob ||
      extractionJob.completed ||
      extractionJob.status === "completed"),
  );
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { id } = event.context.params as { id: string };
  const requestedId = Number.parseInt(id, 10);

  if (!Number.isFinite(requestedId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  const requested = await prisma.poster.findFirst({
    where: { id: requestedId, userId: session.user.id },
    select: { id: true, versionRootId: true, tombstone: true },
  });

  if (!requested) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  if (requested.tombstone) {
    throw createError({
      statusCode: 409,
      statusMessage: "Tombstoned posters cannot be versioned",
    });
  }

  const rootId = posterFamilyRootId(requested);
  const familyWhere = {
    userId: session.user.id,
    ...posterFamilyWhere(rootId),
  };

  const activeDraft = await prisma.poster.findFirst({
    where: {
      ...familyWhere,
      status: { not: "published" },
      id: { not: rootId },
    },
    orderBy: { versionSequence: "desc" },
    select: {
      id: true,
      versionSequence: true,
      imageUrl: true,
      title: true,
      description: true,
      extractionJob: { select: { id: true, status: true, completed: true } },
    },
  });

  if (activeDraft) {
    return {
      posterId: activeDraft.id,
      versionSequence: activeDraft.versionSequence,
      imageUrl: activeDraft.imageUrl,
      title: activeDraft.title,
      description: activeDraft.description,
      extractionJobId: activeDraft.extractionJob?.id,
      extractionStatus: activeDraft.extractionJob?.status,
      extractionCompleted: activeDraft.extractionJob?.completed ?? true,
      reviewReady: isVersionReviewReady(
        activeDraft.imageUrl,
        activeDraft.extractionJob,
      ),
      resumed: true,
    };
  }

  const blockingExtraction = await prisma.poster.findFirst({
    where: {
      userId: session.user.id,
      versionRootId: { not: null },
      status: { not: "published" },
      extractionJob: {
        is: { status: { in: ["pending-extraction", "processing"] } },
      },
    },
    select: { id: true, title: true },
  });

  if (blockingExtraction) {
    throw createError({
      statusCode: 409,
      statusMessage: `Wait for metadata extraction on “${blockingExtraction.title}” to finish before starting another version`,
      data: { posterId: blockingExtraction.id },
    });
  }

  const source = await prisma.poster.findFirst({
    where: { ...familyWhere, status: "published" },
    orderBy: { versionSequence: "desc" },
    include: { posterMetadata: true, extractionJob: true },
  });

  if (!source) {
    throw createError({
      statusCode: 400,
      statusMessage: "Only a published poster can be versioned",
    });
  }

  if (source.tombstone) {
    throw createError({
      statusCode: 409,
      statusMessage: "Tombstoned posters cannot be versioned",
    });
  }

  if (!source.posterMetadata || !source.extractionJob?.filePath) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Only a published poster with a stored file can be versioned",
    });
  }

  if (source.automated) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Auto-indexed posters cannot be versioned through Posters.science",
    });
  }

  const rootPoster = await prisma.poster.findFirst({
    where: { id: rootId, userId: session.user.id },
    select: { extractionJob: { select: { filePath: true } } },
  });
  const originalFilePath = rootPoster?.extractionJob?.filePath.replace(
    /^\/+/,
    "",
  );
  const originalPathParts = originalFilePath?.split("/") ?? [];

  if (
    !originalFilePath ||
    originalPathParts.length < 4 ||
    originalPathParts[0] !== "posters" ||
    originalPathParts.includes("..")
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "The original poster storage location is invalid",
    });
  }

  const formData = await readMultipartFormData(event);
  const fileMode = fieldValue(formData, "fileMode");
  const metadataMode = fieldValue(formData, "metadataMode");

  if (fileMode !== "reuse" && fileMode !== "upload") {
    throw createError({ statusCode: 400, statusMessage: "Invalid file mode" });
  }
  if (metadataMode !== "copy" && metadataMode !== "extract") {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid metadata mode",
    });
  }
  if (fileMode === "reuse" && metadataMode !== "copy") {
    throw createError({
      statusCode: 400,
      statusMessage: "Metadata extraction requires a newly uploaded file",
    });
  }

  const config = useRuntimeConfig(event);
  const { bunnyPrivateStorage, bunnyPrivateStorageKey, posterExtractionApi } =
    config;

  if (!bunnyPrivateStorage || !bunnyPrivateStorageKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "Poster storage is not configured",
    });
  }

  const needsPosterService =
    metadataMode === "extract" || fileMode === "upload" || !source.imageUrl;
  if (needsPosterService && !posterExtractionApi) {
    throw createError({
      statusCode: 503,
      statusMessage: "Poster extraction service is not configured",
    });
  }

  const uploaded = formData?.find(
    (entry) => entry.name === "file" && entry.filename,
  );
  let fileName = source.extractionJob.fileName;
  let fileType = "application/octet-stream";
  let fileBytes: Uint8Array;

  if (fileMode === "upload") {
    if (!uploaded?.data || !uploaded.filename) {
      throw createError({
        statusCode: 400,
        statusMessage: "No version file provided",
      });
    }
    fileName = uploaded.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    fileType = uploaded.type || "application/octet-stream";
    fileBytes = uploaded.data;

    if (!isAllowedPosterFile(fileName, fileType)) {
      throw createError({
        statusCode: 415,
        statusMessage: "File must be a PDF, JPEG, PNG, or WebP image",
      });
    }
  } else {
    const response = await fetch(
      `${bunnyPrivateStorage}/${source.extractionJob.filePath}`,
      { headers: { AccessKey: bunnyPrivateStorageKey } },
    );

    if (!response.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: "Could not copy the existing poster file",
      });
    }
    fileType = response.headers.get("Content-Type") ?? fileType;
    fileBytes = new Uint8Array(await response.arrayBuffer());
  }

  if (fileBytes.byteLength > MAX_FILE_SIZE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "File must be 10MB or smaller",
    });
  }

  const nextSequence = source.versionSequence + 1;
  const originalFolderPath = originalPathParts.slice(0, -1).join("/");
  const storageId = createId();
  const filePath = `${originalFolderPath}/version-${nextSequence}-${storageId}/${fileName}`;
  const cleanupStoredVersion = async () => {
    const folderPath = filePath.slice(0, filePath.lastIndexOf("/") + 1);
    try {
      const cleanupResponse = await fetch(
        `${bunnyPrivateStorage}/${folderPath}`,
        {
          method: "DELETE",
          headers: { AccessKey: bunnyPrivateStorageKey },
        },
      );

      if (!cleanupResponse.ok) {
        console.error(
          `[poster/version] Failed to clean up ${folderPath}: ${cleanupResponse.status}`,
        );
      }
    } catch (error) {
      console.error("[poster/version] Failed to clean up version file", error);
    }
  };
  const storageResponse = await fetch(`${bunnyPrivateStorage}/${filePath}`, {
    method: "PUT",
    headers: {
      AccessKey: bunnyPrivateStorageKey,
      "Content-Type": fileType,
      "Content-Length": String(fileBytes.byteLength),
    },
    body: fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength,
    ) as ArrayBuffer,
  });

  if (!storageResponse.ok) {
    await cleanupStoredVersion();

    throw createError({
      statusCode: 502,
      statusMessage: "Failed to store version file",
    });
  }

  const meta = source.posterMetadata;
  const previousDoi = meta.doi?.trim();
  const identifiers = Array.isArray(meta.identifiers)
    ? (meta.identifiers as Identifier[]).filter(
        (identifier) =>
          !(
            previousDoi &&
            identifier.identifierType?.toUpperCase() === "DOI" &&
            identifier.identifier?.trim().toLowerCase() ===
              previousDoi.toLowerCase()
          ),
      )
    : [];
  const { relatedIdentifiers } = normalizeVersionRelatedIdentifiers(
    meta.relatedIdentifiers,
    previousDoi,
  );

  const dates = Array.isArray(meta.dates)
    ? (meta.dates as Array<{ dateType?: string }>).filter(
        (date) => date.dateType !== "Submitted",
      )
    : [];
  const version = posterVersionLabel(nextSequence);

  const metadataCreate = {
    doi: null,
    identifiers,
    creators: meta.creators,
    publisher: meta.publisher,
    publicationYear: meta.publicationYear,
    subjects: meta.subjects,
    domain: meta.domain,
    language: meta.language,
    version,
    size: meta.size,
    format: meta.format,
    license: meta.license,
    fundingReferences: meta.fundingReferences,
    conferenceName: meta.conferenceName,
    conferenceLocation: meta.conferenceLocation,
    conferenceUri: meta.conferenceUri,
    conferenceIdentifier: meta.conferenceIdentifier,
    conferenceIdentifierType: meta.conferenceIdentifierType,
    conferenceYear: meta.conferenceYear,
    conferenceStartDate: meta.conferenceStartDate,
    conferenceEndDate: meta.conferenceEndDate,
    conferenceAcronym: meta.conferenceAcronym,
    conferenceSeries: meta.conferenceSeries,
    dates,
    relatedIdentifiers,
    posterContent: meta.posterContent,
    tableCaptions: meta.tableCaptions,
    imageCaptions: meta.imageCaptions,
  };

  let created;
  try {
    created = await prisma.poster.create({
      data: {
        userId: session.user.id,
        versionRootId: rootId,
        versionSequence: nextSequence,
        isLatestVersion: false,
        title: source.title,
        description: source.description,
        imageUrl: fileMode === "reuse" ? source.imageUrl : "",
        status: "draft",
        automated: source.automated,
        ...(metadataMode === "copy" && {
          posterMetadata: { create: metadataCreate as never },
        }),
        extractionJob: {
          create: {
            fileName,
            filePath,
            completed: metadataMode === "copy",
            status:
              metadataMode === "copy" ? "completed" : "pending-extraction",
          },
        },
      },
      include: {
        extractionJob: {
          select: { id: true, status: true, completed: true },
        },
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const concurrent = await prisma.poster.findFirst({
        where: {
          ...familyWhere,
          versionSequence: nextSequence,
          status: { not: "published" },
        },
        include: {
          extractionJob: {
            select: { id: true, status: true, completed: true },
          },
        },
      });
      if (concurrent) {
        // Each request uses a unique storage folder, so the losing request can
        // safely remove its upload without affecting the winning draft.
        await cleanupStoredVersion();

        return {
          posterId: concurrent.id,
          versionSequence: concurrent.versionSequence,
          imageUrl: concurrent.imageUrl,
          title: concurrent.title,
          description: concurrent.description,
          extractionJobId: concurrent.extractionJob?.id,
          extractionStatus: concurrent.extractionJob?.status,
          extractionCompleted: concurrent.extractionJob?.completed ?? true,
          reviewReady: isVersionReviewReady(
            concurrent.imageUrl,
            concurrent.extractionJob,
          ),
          resumed: true,
        };
      }
    }

    await cleanupStoredVersion();
    throw error;
  }

  const responseFailure = async (label: string, response: Response) => {
    const detail = (await response.text().catch(() => "")).slice(0, 500);

    return `${label} failed with status ${response.status}${detail ? `: ${detail}` : ""}`;
  };
  const markPendingExtractionFailed = async (message: string) => {
    try {
      await prisma.extractionJob.updateMany({
        where: { posterId: created.id, status: "pending-extraction" },
        data: { status: "failed", completed: false, error: message },
      });
    } catch (error) {
      console.error(
        "[poster/version] Could not mark extraction trigger as failed",
        error,
      );
    }
  };

  if (metadataMode === "extract" && posterExtractionApi) {
    setImmediate(async () => {
      try {
        const response = await fetch(`${posterExtractionApi}/jobs/check`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error(
            await responseFailure("Extraction trigger", response),
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Extraction trigger failed";
        console.error("[poster/version] Failed to trigger extraction", error);
        await markPendingExtractionFailed(message);
      }
    });
  }

  // A missing thumbnail must be generated from this version's stored file.
  // This covers replacement files and reused files whose source thumbnail was
  // unavailable without borrowing an image from an older poster version.
  if (!created.imageUrl && posterExtractionApi) {
    setImmediate(async () => {
      try {
        const response = await fetch(
          `${posterExtractionApi}/thumbnails/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pdf_path: filePath,
              poster_id: created.id,
            }),
          },
        );
        if (!response.ok) {
          throw new Error(await responseFailure("Thumbnail trigger", response));
        }
      } catch (error) {
        console.error("[poster/version] Failed to trigger thumbnail", error);
      }
    });
  }

  return {
    posterId: created.id,
    versionSequence: created.versionSequence,
    imageUrl: created.imageUrl,
    title: created.title,
    description: created.description,
    extractionJobId: created.extractionJob?.id,
    extractionStatus: created.extractionJob?.status,
    extractionCompleted: created.extractionJob?.completed ?? true,
    reviewReady: isVersionReviewReady(created.imageUrl, created.extractionJob),
    resumed: false,
  };
});
