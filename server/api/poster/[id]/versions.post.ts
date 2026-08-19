type Identifier = { identifier?: string; identifierType?: string };
type RelatedIdentifier = {
  relatedIdentifier?: string;
  relatedIdentifierType?: string;
  relationType?: string;
  resourceTypeGeneral?: string;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);

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

  return ALLOWED_TYPES.has(type) || ALLOWED_EXTENSIONS.has(extension);
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
    select: { id: true, versionRootId: true },
  });

  if (!requested) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
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
      extractionJob: { select: { id: true, status: true, completed: true } },
    },
  });

  if (activeDraft) {
    return {
      posterId: activeDraft.id,
      versionSequence: activeDraft.versionSequence,
      extractionJobId: activeDraft.extractionJob?.id,
      extractionStatus: activeDraft.extractionJob?.status,
      reviewReady: activeDraft.extractionJob?.completed ?? true,
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

  if (!source || !source.posterMetadata || !source.extractionJob?.filePath) {
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
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;

  if (!bunnyPrivateStorage || !bunnyPrivateStorageKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "Poster storage is not configured",
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
  const filePath = `${originalFolderPath}/version-${nextSequence}/${fileName}`;
  const cleanupStoredVersion = async () => {
    const folderPath = filePath.slice(0, filePath.lastIndexOf("/") + 1);
    await fetch(`${bunnyPrivateStorage}/${folderPath}`, {
      method: "DELETE",
      headers: { AccessKey: bunnyPrivateStorageKey },
    }).catch((error) =>
      console.error("[poster/version] Failed to clean up version file", error),
    );
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
  const relatedIdentifiers = Array.isArray(meta.relatedIdentifiers)
    ? ([...meta.relatedIdentifiers] as RelatedIdentifier[])
    : [];

  if (
    previousDoi &&
    !relatedIdentifiers.some(
      (item) =>
        item.relatedIdentifier?.toLowerCase() === previousDoi.toLowerCase() &&
        item.relationType === "IsNewVersionOf",
    )
  ) {
    relatedIdentifiers.push({
      relatedIdentifier: previousDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsNewVersionOf",
      resourceTypeGeneral: "Text",
    });
  }

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
      include: { extractionJob: { select: { id: true } } },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const concurrent = await prisma.poster.findFirst({
        where: {
          ...familyWhere,
          versionSequence: nextSequence,
          status: { not: "published" },
        },
        include: { extractionJob: { select: { id: true, completed: true } } },
      });
      if (concurrent) {
        // The version path is deterministic. A concurrent request writes to
        // the same folder, so deleting it here could remove the winning
        // request's file.

        return {
          posterId: concurrent.id,
          versionSequence: concurrent.versionSequence,
          extractionJobId: concurrent.extractionJob?.id,
          reviewReady: concurrent.extractionJob?.completed ?? true,
          resumed: true,
        };
      }
    }

    await cleanupStoredVersion();
    throw error;
  }

  if (metadataMode === "extract" && config.posterExtractionApi) {
    setImmediate(() => {
      fetch(`${config.posterExtractionApi}/jobs/check`, {
        method: "POST",
      }).catch((error) =>
        console.error("[poster/version] Failed to trigger extraction", error),
      );
    });
  } else if (fileMode === "upload" && config.posterExtractionApi) {
    setImmediate(() => {
      fetch(`${config.posterExtractionApi}/thumbnails/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf_path: filePath, poster_id: created.id }),
      }).catch((error) =>
        console.error("[poster/version] Failed to trigger thumbnail", error),
      );
    });
  }

  return {
    posterId: created.id,
    versionSequence: created.versionSequence,
    extractionJobId: created.extractionJob?.id,
    extractionStatus:
      metadataMode === "copy" ? "completed" : "pending-extraction",
    reviewReady: metadataMode === "copy",
    resumed: false,
  };
});
