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
    },
  });

  if (!poster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  // Build the metadata JSON
  const meta = poster.posterMetadata;

  // Transform to DataCite-compatible format
  const metadata = {
    title: poster.title,
    description: poster.description,
    ...(meta && {
      doi: meta.doi,
      identifiers: meta.identifiers,
      alternateIdentifiers: meta.alternateIdentifiers,
      creators: meta.creators,
      titles: meta.titles,
      descriptions: meta.descriptions,
      publisher: meta.publisher,
      publicationYear: meta.publicationYear,
      subjects: meta.subjects,
      dates: meta.dates,
      language: meta.language,
      types: meta.types,
      relatedIdentifiers: meta.relatedIdentifiers,
      sizes: meta.sizes,
      formats: meta.formats,
      version: meta.version,
      rightsList: meta.rightsList,
      fundingReferences: meta.fundingReferences,
      ethicsApprovals: meta.ethicsApproval,
      conference: {
        conferenceName: meta.conferenceName,
        conferenceLocation: meta.conferenceLocation,
        conferenceUri: meta.conferenceUri,
        conferenceIdentifier: meta.conferenceIdentifier,
        conferenceIdentifierType: meta.conferenceIdentifierType,
        conferenceSchemaUri: meta.conferenceSchemaUri,
        conferenceStartDate: meta.conferenceStartDate,
        conferenceEndDate: meta.conferenceEndDate,
        conferenceAcronym: meta.conferenceAcronym,
        conferenceSeries: meta.conferenceSeries,
      },
      posterContent: meta.posterContent,
      tableCaption: meta.tableCaption,
      imageCaption: meta.imageCaption,
      domain: meta.domain,
    }),
  };

  const jsonContent = JSON.stringify(metadata, null, 2);

  setHeader(event, "Content-Type", "application/json");
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename="poster-${posterId}.json"`,
  );

  return jsonContent;
});
