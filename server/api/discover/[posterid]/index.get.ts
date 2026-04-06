/* eslint-disable @typescript-eslint/no-explicit-any */

export default defineEventHandler(async (event) => {
  const { posterid } = event.context.params as { posterid: string };
  const posterId = parseInt(posterid);

  if (isNaN(posterId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  const poster = await prisma.poster.findFirst({
    where: { id: posterId, status: "published" },
    include: {
      user: { select: { givenName: true, familyName: true } },
      posterMetadata: true,
      _count: { select: { likes: true } },
    },
  });

  if (!poster) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  const meta = poster.posterMetadata;

  const session = await getUserSession(event);
  const userId = session?.user?.id as string | undefined;

  const liked = userId
    ? Boolean(
        await prisma.like.findUnique({
          where: { userId_posterId: { userId, posterId } },
        }),
      )
    : false;

  const { umamiWebsiteId } = useRuntimeConfig();

  let views: number | null = null;

  const umamiToken = await getUmamiToken();

  if (umamiToken && umamiWebsiteId) {
    try {
      const params = new URLSearchParams({
        startAt: "0",
        endAt: String(Date.now()),
        path: `/discover/${posterid}`,
      });

      const data = await $fetch<{ visits: number }>(
        `https://umami.fairdataihub.org/api/websites/${umamiWebsiteId}/stats?${params}`,
        { headers: { Authorization: `Bearer ${umamiToken}` } },
      );

      views = data.visits ?? null;
    } catch {
      // non-critical, leave views as null
    }
  }

  return {
    id: poster.id,
    views,
    likes: poster._count.likes,
    liked,
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
    publisher: meta?.publisher ?? null,
    publicationYear: meta?.publicationYear ?? null,
    language: meta?.language ?? null,
    format: meta?.format ?? null,
    size: meta?.size ?? null,
    domain: meta?.domain ?? null,
    keywords: meta?.subjects ?? [],
    identifiers: (meta?.identifiers as any[]) ?? [],
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
