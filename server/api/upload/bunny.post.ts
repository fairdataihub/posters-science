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

  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;
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

  const fileName = fileEntry.filename || "poster.pdf";
  const fileType = fileEntry.type || "application/pdf";
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileId = createId();
  const filePath = `${siteEnv}/posters/${fileId}/${safeName}`;
  const uploadUrl = `${bunnyPrivateStorage}/${filePath}`;

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: bunnyPrivateStorageKey,
      "Content-Type": fileType,
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
      status: "pre-extraction",
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

  return {
    posterId: poster.id,
    status: "pending-extraction",
    extractionJobId: poster.extractionJob?.id,
  };
});
