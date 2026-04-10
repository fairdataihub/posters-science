export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { id } = event.context.params as { id: string };

  const posterId = parseInt(id);
  if (isNaN(posterId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  const { user } = session;

  const poster = await prisma.poster.findUnique({
    where: { id: posterId, userId: user.id },
    select: { imageUrl: true, publishedAt: true, status: true },
  });

  if (!poster) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  if (!poster.imageUrl) {
    throw createError({
      statusCode: 404,
      statusMessage: "No thumbnail available",
    });
  }

  const config = useRuntimeConfig();
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;

  // Private storage — proxy the image with the access key so the client never needs credentials
  if (bunnyPrivateStorage && poster.imageUrl.startsWith(bunnyPrivateStorage)) {
    const res = await fetch(poster.imageUrl, {
      headers: { AccessKey: bunnyPrivateStorageKey },
    });

    if (!res.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: "Failed to fetch thumbnail from storage",
      });
    }

    const contentType = res.headers.get("Content-Type") ?? "image/jpeg";
    setHeader(event, "Content-Type", contentType);
    setHeader(event, "Cache-Control", "private, max-age=3600");

    return sendStream(event, res.body!);
  }

  // Public URL (published poster or external) — redirect the client directly
  return sendRedirect(event, poster.imageUrl, 302);
});
