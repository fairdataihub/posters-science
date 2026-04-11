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
      extractionJob: { select: { filePath: true } },
    },
  });

  if (!poster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  if (poster.status === "published") {
    throw createError({
      statusCode: 400,
      statusMessage: "Cannot generate thumbnail for a published poster",
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

  const response = await fetch(`${posterExtractionApi}/thumbnails/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdf_path: filePath, poster_id: posterId }),
  });

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

  return { success: true };
});
