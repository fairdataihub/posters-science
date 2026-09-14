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
  const userId = user.id;

  const poster = await prisma.poster.findUnique({
    where: {
      id: posterId,
      userId,
    },
    include: {
      posterMetadata: true,
      zenodoDepositions: true,
      extractionJob: {
        select: {
          completed: true,
          status: true,
          fileName: true,
          filePath: true,
        },
      },
    },
  });

  if (!poster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  const meta = poster.posterMetadata;
  const rootPosterId = posterFamilyRootId(poster);
  const versions = await prisma.poster.findMany({
    where: {
      userId,
      status: "published",
      ...posterFamilyWhere(rootPosterId),
    },
    orderBy: { versionSequence: "desc" },
    select: {
      id: true,
      versionSequence: true,
      publishedAt: true,
      posterMetadata: { select: { version: true, doi: true } },
    },
  });

  if (!meta) {
    return { ...poster, rootPosterId, versions };
  }

  // Normalize posterContent: DB may store array (sections) or object
  const rawPosterContent = meta.posterContent as
    | { sections?: unknown[]; unstructuredContent?: string }
    | unknown[]
    | null;
  const posterContent = Array.isArray(rawPosterContent)
    ? { sections: rawPosterContent, unstructuredContent: "" }
    : (rawPosterContent ?? { sections: [], unstructuredContent: "" });

  // Extract presented dates from the dates JSON array
  const datesArr = Array.isArray(meta.dates)
    ? (meta.dates as Array<{ date?: string; dateType?: string }>)
    : [];
  const presentedEntry = datesArr.find((d) => d.dateType === "Presented");
  let presentedStartDate = "";
  let presentedEndDate = "";
  if (presentedEntry?.date) {
    const parts = presentedEntry.date.split("/");
    presentedStartDate = parts[0] ?? "";
    presentedEndDate = parts[1] ?? parts[0] ?? "";
  }

  // Nested conference object from flat DB fields (for form convenience)
  const conference = {
    conferenceName: meta.conferenceName,
    conferenceLocation: meta.conferenceLocation,
    conferenceUri: meta.conferenceUri,
    conferenceIdentifier: meta.conferenceIdentifier,
    conferenceIdentifierType: meta.conferenceIdentifierType,
    conferenceYear: meta.conferenceYear,
    conferenceStartDate: meta.conferenceStartDate,
    conferenceEndDate: meta.conferenceEndDate,
    conferenceAcronym: meta.conferenceAcronym,
    conferenceSeries: meta.conferenceSeries,
    presentedStartDate,
    presentedEndDate,
  };

  return {
    ...poster,
    rootPosterId,
    versions,
    posterMetadata: {
      ...meta,
      posterContent,
      conference,
    },
  };
});
