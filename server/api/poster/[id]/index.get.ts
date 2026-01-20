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

  // Transform DB format to JSON schema format
  const meta = poster.posterMetadata;
  if (!meta) {
    return poster;
  }

  // Transform types from DB array to single object
  const typesArray = meta.types as
    | { resourceType?: string; resourceTypeGeneral?: string }[]
    | null;
  const types =
    Array.isArray(typesArray) && typesArray.length > 0 ? typesArray[0] : null;

  // Transform posterContent from DB array to object with sections
  const posterContentArray = meta.posterContent as
    | { sectionTitle?: string; sectionContent?: string }[]
    | null;
  const posterContent = posterContentArray
    ? { sections: posterContentArray }
    : null;

  // Build nested conference object from flat DB fields
  const conference = {
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
  };

  // Return transformed poster with JSON schema format
  return {
    ...poster,
    posterMetadata: {
      ...meta,
      // Renamed field
      ethicsApprovals: meta.ethicsApproval,
      // Transformed fields
      types,
      posterContent,
      conference,
      conferenceName: undefined,
      conferenceLocation: undefined,
      conferenceUri: undefined,
      conferenceIdentifier: undefined,
      conferenceIdentifierType: undefined,
      conferenceSchemaUri: undefined,
      conferenceStartDate: undefined,
      conferenceEndDate: undefined,
      conferenceAcronym: undefined,
      conferenceSeries: undefined,
      // Remove old field name
      ethicsApproval: undefined,
    },
  };
});
