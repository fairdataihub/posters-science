import { z } from "zod";

const payloadSchema = z.object({
  doi: z.string().optional(),
  license: z.string().optional(),
  publisher: z.string().optional(),
  publicationYear: z.number().optional(),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { id } = event.context.params as { id: string };

  const posterId = parseInt(id);
  if (isNaN(posterId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid poster ID",
    });
  }

  const { user } = session;

  const poster = await prisma.poster.findUnique({
    where: { id: posterId, userId: user.id },
    select: { id: true, status: true },
  });

  if (!poster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  const body = await readValidatedBody(event, payloadSchema.parse);

  const updateData: Record<string, unknown> = {};
  if (body.doi !== undefined) updateData.doi = body.doi;
  if (body.license !== undefined) updateData.license = body.license;
  if (body.publisher !== undefined) updateData.publisher = body.publisher;
  if (body.publicationYear !== undefined)
    updateData.publicationYear = body.publicationYear;

  await prisma.posterMetadata.update({
    where: { posterId },
    data: updateData,
  });

  if (poster.status === "downloaded") {
    const config = useRuntimeConfig();
    const {
      bunnyPrivateStorage,
      bunnyPrivateStorageKey,
      bunnyPublicStorage,
      bunnyPublicStorageKey,
    } = config;

    // Fetch the current imageUrl to check if there is a thumbnail to move
    const posterWithImage = await prisma.poster.findUnique({
      where: { id: posterId },
      select: { imageUrl: true },
    });

    let newImageUrl: string | undefined;

    const imageUrl = posterWithImage?.imageUrl;
    if (
      imageUrl &&
      bunnyPrivateStorage &&
      imageUrl.startsWith(bunnyPrivateStorage)
    ) {
      // Extract the storage path from the private storage URL
      const thumbnailPath = imageUrl
        .slice(bunnyPrivateStorage.length)
        .replace(/^\//, "");

      if (
        bunnyPrivateStorageKey &&
        bunnyPublicStorage &&
        bunnyPublicStorageKey
      ) {
        try {
          // Download thumbnail from private storage
          const downloadRes = await fetch(
            `${bunnyPrivateStorage}/${thumbnailPath}`,
            { headers: { AccessKey: bunnyPrivateStorageKey } },
          );

          if (downloadRes.ok) {
            const fileBuffer = await downloadRes.arrayBuffer();

            // Upload to public storage at the same path
            const uploadRes = await fetch(
              `${bunnyPublicStorage}/${thumbnailPath}`,
              {
                method: "PUT",
                headers: {
                  AccessKey: bunnyPublicStorageKey,
                  "Content-Type": "image/jpeg",
                  "Content-Length": String(fileBuffer.byteLength),
                },
                body: fileBuffer,
              },
            );

            if (uploadRes.ok) {
              newImageUrl = `${bunnyPublicStorage}/${thumbnailPath}`;
            } else {
              console.error(
                `[publication] Failed to upload thumbnail to public storage: ${uploadRes.status}`,
              );
            }
          } else {
            console.error(
              `[publication] Failed to download thumbnail from private storage: ${downloadRes.status}`,
            );
          }
        } catch (err) {
          console.error("[publication] Error moving thumbnail:", err);
        }
      }
    }

    await prisma.poster.update({
      where: { id: posterId },
      data: {
        status: "published",
        publishedAt: new Date(),
        ...(newImageUrl && { imageUrl: newImageUrl }),
      },
    });
  }

  return { success: true };
});
