import { flattenError } from "zod";
import {
  strictFormSchema,
  type StrictFormSchema,
} from "~~/app/utils/poster_schema";

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

  const isDraft = getQuery(event).draft === "true";

  // Parse and validate the request body
  const body = await readBody(event);

  let data: StrictFormSchema;

  if (isDraft) {
    data = body as StrictFormSchema;
  } else {
    const parseResult = strictFormSchema.safeParse(body);

    if (!parseResult.success) {
      throw createError({
        statusCode: 422,
        statusMessage: "Invalid poster data",
        data: {
          ...flattenError(parseResult.error),
          issues: parseResult.error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        },
      });
    }

    data = parseResult.data;
  }

  // Transform form data to DB format (PosterMetadata fields only)
  const creators = (data.creators ?? []).map((creator) => ({
    name:
      [creator.givenName, creator.familyName].filter(Boolean).join(" ") ||
      "Unknown Creator",
    ...(creator.nameType && { nameType: creator.nameType }),
    ...(creator.nameIdentifiers && {
      nameIdentifiers: creator.nameIdentifiers.map((ni) => ({
        nameIdentifier: ni.nameIdentifier,
        nameIdentifierScheme: ni.nameIdentifierScheme,
        schemeURI: ni.schemeURI,
      })),
    }),
    ...(creator.affiliation && {
      affiliation: creator.affiliation.map((aff) => ({
        name: aff.name,
        ...(aff.affiliationIdentifier && {
          affiliationIdentifier: aff.affiliationIdentifier,
        }),
        ...(aff.affiliationIdentifierScheme && {
          affiliationIdentifierScheme: aff.affiliationIdentifierScheme,
        }),
        ...(aff.schemeURI && { schemeURI: aff.schemeURI }),
      })),
    }),
  }));

  const posterTitle = data.title || "Untitled Poster";
  const posterDescription = data.description || "No description provided";

  const identifiers = data.identifiers ?? [];
  const publisher = data.publisher ?? null;
  const publicationYear = data.publicationYear ?? null;
  const subjects = Array.from(
    new Map(
      (data.subjects ?? [])
        .map((subject) => subject.trim())
        .filter((subject) => subject.length > 0)
        .map((subject) => [subject.toLowerCase(), subject]),
    ).values(),
  );
  const language = data.language || null;
  const relatedIdentifiers = data.relatedIdentifiers ?? [];
  const size = data.size || null;
  const format = data.format || null;
  const version = data.version || null;
  const license = data.license || null;
  const fundingReferences = data.fundingReferences ?? [];

  const { conference } = data;
  const conferenceName = conference?.conferenceName ?? null;
  const conferenceLocation = conference?.conferenceLocation ?? null;
  const conferenceUri = conference?.conferenceUri ?? null;
  const conferenceIdentifier = conference?.conferenceIdentifier ?? null;
  const conferenceIdentifierType = conference?.conferenceIdentifierType ?? null;
  const conferenceYear = conference?.conferenceYear ?? null;
  const conferenceStartDate = conference?.conferenceStartDate ?? null;
  const conferenceEndDate = conference?.conferenceEndDate ?? null;
  const conferenceAcronym = conference?.conferenceAcronym ?? null;
  const conferenceSeries = conference?.conferenceSeries ?? null;

  const posterContent = data.posterContent ?? {
    sections: [],
    unstructuredContent: "",
  };
  const tableCaptions = data.tableCaptions ?? [];
  const imageCaptions = data.imageCaptions ?? [];
  const domain = data.domain ?? "Other";

  const updatedPoster = await prisma.poster.update({
    where: {
      id: posterId,
    },
    data: {
      title: posterTitle,
      description: posterDescription,
      posterMetadata: {
        update: {
          doi: data.doi ?? null,
          identifiers,
          creators,
          publisher,
          publicationYear,
          subjects,
          language,
          relatedIdentifiers,
          size,
          format,
          version,
          license,
          fundingReferences,
          conferenceName,
          conferenceLocation,
          conferenceUri,
          conferenceIdentifier,
          conferenceIdentifierType,
          conferenceYear,
          conferenceStartDate,
          conferenceEndDate,
          conferenceAcronym,
          conferenceSeries,
          posterContent,
          tableCaptions,
          imageCaptions,
          domain,
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
