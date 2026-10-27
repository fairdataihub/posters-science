export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const { id } = event.context.params as { id: string };
  const posterId = Number.parseInt(id, 10);

  if (Number.isNaN(posterId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  const poster = await prisma.poster.findUnique({
    where: { id: posterId },
    select: {
      ...POSTER_ADMIN_SELECT,
      description: true,
      posterMetadata: true,
      zenodoDepositions: true,
      extractionJob: true,
    },
  });

  if (!poster) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  const rootId = posterFamilyRootId(poster);

  const family = await prisma.poster.findMany({
    where: posterFamilyWhere(rootId),
    select: {
      id: true,
      status: true,
      versionSequence: true,
      isLatestVersion: true,
      tombstone: true,
      publishedAt: true,
      created: true,
      posterMetadata: { select: { doi: true, version: true } },
    },
    orderBy: { versionSequence: "asc" },
  });

  return { poster, rootId, family };
});
