/* eslint-disable @typescript-eslint/no-explicit-any */

export default defineEventHandler(async (event) => {
  const { posterid } = event.context.params as { posterid: string };
  const posterId = parseInt(posterid);

  if (isNaN(posterId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid poster ID" });
  }

  const requested = await prisma.poster.findFirst({
    where: { id: posterId, status: "published" },
    select: { id: true, versionRootId: true },
  });

  if (!requested) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  const rootPosterId = posterFamilyRootId(requested);
  const root = await prisma.poster.findFirst({
    where: { id: rootPosterId, tombstone: false },
    select: { id: true },
  });

  if (!root) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  const versionParam = getQuery(event).version;
  const requestedVersion = (
    Array.isArray(versionParam) ? versionParam[0] : versionParam
  )
    ?.toString()
    .trim();
  const requestedSequence = /^\d+$/.test(requestedVersion ?? "")
    ? Number.parseInt(requestedVersion!, 10)
    : undefined;
  const posterInclude = {
    user: { select: { givenName: true, familyName: true } },
    posterMetadata: true,
    _count: { select: { likes: true } },
  } as const;

  // Public URLs use the user-facing metadata label. The integer sequence is
  // retained as a fallback for old links and records that predate version
  // metadata.
  let poster = requestedVersion
    ? await prisma.poster.findFirst({
        where: {
          status: "published",
          ...posterFamilyWhere(rootPosterId),
          posterMetadata: { is: { version: requestedVersion } },
        },
        orderBy: { versionSequence: "desc" },
        include: posterInclude,
      })
    : await prisma.poster.findFirst({
        where: {
          status: "published",
          ...posterFamilyWhere(rootPosterId),
          isLatestVersion: true,
        },
        orderBy: { versionSequence: "desc" },
        include: posterInclude,
      });

  if (!poster && requestedSequence !== undefined) {
    poster = await prisma.poster.findFirst({
      where: {
        status: "published",
        ...posterFamilyWhere(rootPosterId),
        versionSequence: requestedSequence,
      },
      include: posterInclude,
    });
  }

  if (!poster) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  const meta = poster.posterMetadata;

  const session = await getUserSession(event);
  const userId = session?.user?.id as string | undefined;

  const liked = userId
    ? Boolean(
        await prisma.like.findUnique({
          where: { userId_posterId: { userId, posterId: rootPosterId } },
        }),
      )
    : false;
  const likes = await prisma.like.count({ where: { posterId: rootPosterId } });

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

  const versions = await prisma.poster.findMany({
    where: { status: "published", ...posterFamilyWhere(rootPosterId) },
    orderBy: { versionSequence: "desc" },
    select: {
      versionSequence: true,
      publishedAt: true,
      posterMetadata: { select: { version: true, doi: true } },
    },
  });

  return {
    id: rootPosterId,
    versionPosterId: poster.id,
    versionSequence: poster.versionSequence,
    isLatestVersion: poster.isLatestVersion,
    versions,
    automated: poster.automated,
    views,
    likes,
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
    submissionAbstract:
      (meta?.posterContent as any)?.submissionAbstract ?? null,
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
