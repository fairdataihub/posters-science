import { copyThumbnailToPublicZone } from "../../../utils/zenodo";

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
    select: {
      id: true,
      status: true,
      tombstone: true,
      extractionJob: { select: { filePath: true } },
    },
  });

  if (!poster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  if (poster.tombstone) {
    throw createError({
      statusCode: 400,
      statusMessage: "Cannot generate thumbnail for a withdrawn poster",
    });
  }

  const filePath = poster.extractionJob?.filePath;
  if (!filePath) {
    throw createError({
      statusCode: 400,
      statusMessage: "No file path available for this poster",
    });
  }

  const config = useRuntimeConfig();
  const { posterExtractionApi } = config;

  if (!posterExtractionApi) {
    throw createError({
      statusCode: 503,
      statusMessage: "Extraction API not configured",
    });
  }

  // A published poster is served from the public zone, so its thumbnail needs
  // promoting before imageUrl is written.
  const isPublished = poster.status === "published";

  let response: Response;

  try {
    response = await fetch(`${posterExtractionApi}/thumbnails/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdf_path: filePath }),
    });
  } catch (error) {
    console.error(
      `[thumbnail] Could not reach generation service for poster ${posterId}`,
      error,
    );
    throw createError({
      statusCode: 502,
      statusMessage: "Could not reach the thumbnail generation service",
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `[thumbnail] Generation failed for poster ${posterId}: ${response.status} ${errorText}`,
    );
    throw createError({
      statusCode: 502,
      statusMessage: "Thumbnail generation failed",
      message: errorText,
    });
  }

  const result = (await response.json()) as { thumbnail_path?: string };
  const generatedUrl = result.thumbnail_path?.trim();
  if (!generatedUrl) {
    throw createError({
      statusCode: 502,
      statusMessage: "Thumbnail service returned no poster preview",
    });
  }

  let imageUrl = generatedUrl;

  if (isPublished) {
    const promoted = await copyThumbnailToPublicZone(generatedUrl);

    if (!promoted.success) {
      console.error(
        `[thumbnail] Could not copy thumbnail into public zone for published poster ${posterId}: ${promoted.error}`,
      );
      throw createError({
        statusCode: 502,
        statusMessage: promoted.error,
      });
    }

    imageUrl = promoted.imageUrl;
  }

  await prisma.poster.update({
    where: { id: posterId },
    data: { imageUrl },
  });

  return { success: true, imageUrl };
});
