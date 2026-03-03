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

  if (poster.status !== "draft") {
    throw createError({
      statusCode: 400,
      statusMessage: "Only draft posters can be deleted",
    });
  }

  const filePath = poster.extractionJob?.filePath;

  await prisma.poster.delete({ where: { id: posterId } });

  const config = useRuntimeConfig();
  if (filePath && config.bunnyPrivateStorage && config.bunnyPrivateStorageKey) {
    const res = await fetch(`${config.bunnyPrivateStorage}/${filePath}`, {
      method: "DELETE",
      headers: { AccessKey: config.bunnyPrivateStorageKey },
    });
    if (!res.ok) {
      console.error(
        `[poster/delete] Bunny delete failed for ${filePath}: ${res.status}`,
      );
    }
  }

  return { success: true };
});
