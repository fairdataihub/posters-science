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
  if (!meta) {
    return poster;
  }

  // Normalize posterContent: DB may store array (sections) or object
  const rawPosterContent = meta.posterContent as
    | { sections?: unknown[]; unstructuredContent?: string }
    | unknown[]
    | null;
  const posterContent = Array.isArray(rawPosterContent)
    ? { sections: rawPosterContent, unstructuredContent: "" }
    : (rawPosterContent ?? { sections: [], unstructuredContent: "" });

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
  };

  return {
    ...poster,
    posterMetadata: {
      ...meta,
      posterContent,
      conference,
    },
  };
});
