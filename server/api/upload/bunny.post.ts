import { createId } from "@paralleldrive/cuid2";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const config = useRuntimeConfig();

  const session = await getUserSession(event);
  const userId = session?.user?.id;

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
    });
  }

  const { bunnyPrivateStorage, bunnyPrivateStorageKey, posterExtractionApi } =
    config;
  const { siteEnv } = config.public;

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

  if (!fileEntry || !fileEntry.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "File not found in request",
    });
  }

  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
  if (fileEntry.data.length > MAX_FILE_SIZE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "File too large",
      message: "File must be 10MB or smaller",
    });
  }

  const folderExtension =
    siteEnv === "production" ? "p" : siteEnv === "staging" ? "s" : "d";

  const fileName = fileEntry.filename || "poster.pdf";
  const fileType = fileEntry.type || "application/pdf";
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileId = createId();
  const filePath = `posters/${folderExtension}/${fileId}/${safeName}`;
  const uploadUrl = `${bunnyPrivateStorage}/${filePath}`;

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: bunnyPrivateStorageKey,
      "Content-Type": fileType,
      "Content-Length": String(fileEntry.data.length),
    },
    body: fileEntry.data as BodyInit,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    console.error("Bunny upload failed:", uploadResponse.status, text);
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to upload file to storage",
      message: `Bunny CDN returned ${uploadResponse.status}`,
    });
  }

  // Create a poster and extraction job
  const poster = await prisma.poster.create({
    data: {
      userId,
      title: safeName,
      description: "",
      imageUrl: "",
      status: "draft",
      extractionJob: {
        create: {
          fileName: safeName,
          filePath,
          status: "pending-extraction",
        },
      },
    },
    include: {
      extractionJob: {
        select: {
          id: true,
        },
      },
    },
  });

  // Trigger extraction API to process the new job immediately (don't wait for its poll interval)
  if (posterExtractionApi) {
    setImmediate(() => {
      fetch(`${posterExtractionApi}/jobs/check`, { method: "POST" }).catch(
        (err) => {
          console.error("[upload/bunny] Failed to trigger jobs/check:", err);
        },
      );
    });
  }

  return {
    posterId: poster.id,
    status: "pending-extraction",
    extractionJobId: poster.extractionJob?.id,
  };
});
