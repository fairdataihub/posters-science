import { strictFormSchema } from "~~/app/utils/poster_schema";

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

  // Check that the poster exists and belongs to the user
  const existingPoster = await prisma.poster.findUnique({
    where: {
      id: posterId,
      userId,
    },
    include: {
      posterMetadata: true,
    },
  });

  if (!existingPoster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  // Parse and validate the request body
  const body = await readBody(event);
  const parseResult = strictFormSchema.safeParse(body);

  if (!parseResult.success) {
    throw createError({
      statusCode: 422,
      statusMessage: "Invalid poster data",
      data: parseResult.error.flatten(),
    });
  }

  const data = parseResult.data;

  // Transform form data to DB format
  const creators = (data.creators ?? []).map((creator) => ({
    name:
      [creator.givenName, creator.familyName].filter(Boolean).join(" ") ||
      "Unknown Creator",
    ...(creator.nameType && { nameType: creator.nameType }),
    ...(creator.nameIdentifiers && {
      nameIdentifiers: creator.nameIdentifiers.map((ni) => ({
        nameIdentifier: ni.nameIdentifier,
      })),
    }),
    ...(creator.affiliation && {
      affiliation: creator.affiliation.map((aff) => ({ name: aff.name })),
    }),
  }));

  const imageCaption = data.imageCaption ?? [];
  const tableCaption = data.tableCaption ?? [];
  const titles = data.titles ?? [];
  const descriptions = data.descriptions ?? [];

  const posterTitle = data.title || titles[0]?.title || "Untitled Poster";
  const posterDescription =
    data.description ||
    descriptions[0]?.description ||
    "No description provided for this poster";

  const identifiers = data.identifiers ?? [];
  const alternateIdentifiers = data.alternateIdentifiers ?? [];
  // Transform publisher from single object to array for DB
  const publisher = data.publisher?.name ? [data.publisher] : [];
  const publicationYear = data.publicationYear ?? null;
  const subjects = data.subjects ?? [];
  // Transform dates from form format (start/end) to DB format
  // Filter out dates without a valid start date and convert undefined to null
  const dates = (data.dates ?? [])
    .filter((d) => d.start)
    .map((d) => ({
      date: d.start,
      dateType: d.dateType ?? null,
      dateInformation: d.dateInformation ?? null,
    }));
  const language = data.language || null;
  // Transform types from single object to array for DB
  const types = data.types?.resourceType ? [data.types] : [];
  const relatedIdentifiers = data.relatedIdentifiers ?? [];
  const sizes = data.sizes ?? [];
  const formats = data.formats ?? [];
  const version = data.version || null;
  const rightsList = data.rightsList ?? [];
  const fundingReferences = data.fundingReferences ?? [];
  // Use ethicsApprovals (plural) from form, store as ethicsApproval in DB
  const ethicsApproval = data.ethicsApprovals ?? [];

  // Extract flat conference fields from nested conference object
  const conference = data.conference;
  const conferenceName = conference?.conferenceName || null;
  const conferenceLocation = conference?.conferenceLocation || null;
  const conferenceUri = conference?.conferenceUri || null;
  const conferenceIdentifier = conference?.conferenceIdentifier || null;
  const conferenceIdentifierType = conference?.conferenceIdentifierType || null;
  const conferenceSchemaUri = conference?.conferenceSchemaUri || null;
  const conferenceStartDate = conference?.conferenceStartDate || null;
  const conferenceEndDate = conference?.conferenceEndDate || null;
  const conferenceAcronym = conference?.conferenceAcronym || null;
  const conferenceSeries = conference?.conferenceSeries || null;

  const domain = data.domain || "Other";

  // Update the poster and its metadata
  const updatedPoster = await prisma.poster.update({
    where: {
      id: posterId,
    },
    data: {
      title: posterTitle,
      description: posterDescription,
      posterMetadata: {
        update: {
          creators,
          titles,
          descriptions,
          imageCaption,
          tableCaption,
          conferenceName,
          conferenceLocation,
          conferenceUri,
          conferenceIdentifier,
          conferenceIdentifierType,
          conferenceSchemaUri,
          conferenceStartDate,
          conferenceEndDate,
          conferenceAcronym,
          conferenceSeries,
          domain,
          identifiers,
          alternateIdentifiers,
          publisher,
          publicationYear,
          subjects,
          dates,
          language,
          types,
          relatedIdentifiers,
          sizes,
          formats,
          version,
          rightsList,
          fundingReferences,
          ethicsApproval,
        },
      },
    },
    include: {
      posterMetadata: true,
    },
  });

  return {
    posterId: updatedPoster.id,
    message: "Poster updated successfully",
  };
});
