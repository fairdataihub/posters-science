export default defineEventHandler(async (event) => {
  const { posterid } = event.context.params as { posterid: string };
  const posterId = parseInt(posterid);

  if (isNaN(posterId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  const poster = await prisma.poster.findUnique({
    where: { id: posterId, status: "published" },
    include: {
      user: { select: { givenName: true, familyName: true } },
      posterMetadata: true,
    },
  });

  if (!poster) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  const meta = poster.posterMetadata;

  return {
    id: poster.id,
    title: poster.title,
    description: poster.description,
    imageUrl: poster.imageUrl,
    publishedAt: poster.publishedAt,
    created: poster.created,
    updated: poster.updated,
    user: poster.user,
    doi: meta?.doi ?? null,
    license: meta?.license ?? null,
    version: meta?.version ?? null,
    keywords: meta?.subjects ?? [],
    creators: (meta?.creators as any[]) ?? [],
    fundingReferences: (meta?.fundingReferences as any[]) ?? [],
    relatedIdentifiers: (meta?.relatedIdentifiers as any[]) ?? [],
    conference: {
      conferenceName: meta?.conferenceName ?? null,
      conferenceAcronym: meta?.conferenceAcronym ?? null,
      conferenceYear: meta?.conferenceYear ?? null,
      conferenceLocation: meta?.conferenceLocation ?? null,
      conferenceStartDate: meta?.conferenceStartDate ?? null,
      conferenceEndDate: meta?.conferenceEndDate ?? null,
      conferenceUri: meta?.conferenceUri ?? null,
      conferenceSeries: meta?.conferenceSeries ?? null,
    },
  };
});
