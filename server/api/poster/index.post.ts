import { faker } from "@faker-js/faker";
import { Agent } from "undici";
import { schema } from "~~/app/utils/poster_schema";

const extractionAgent = new Agent({
  headersTimeout: 900000, // 15 minutes
  bodyTimeout: 900000, // 15 minutes
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { user } = session;
  const userId = user.id;

  const extractionApiUrl = process.env.POSTER_EXTRACTION_API;

  // Read multipart form data
  const formData = await readMultipartFormData(event);

  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "No file provided",
    });
  }

  // Find the file in the form data
  const fileEntry = formData.find(
    (entry) => entry.name === "file" && entry.filename,
  );

  if (!fileEntry || !fileEntry.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "File not found in request",
    });
  }

  // Create FormData to forward to external API
  const forwardFormData = new FormData();
  // Convert Buffer to Uint8Array for Blob
  const fileBuffer = Buffer.from(fileEntry.data);
  const blob = new Blob([fileBuffer], {
    type: fileEntry.type || "application/pdf",
  });
  forwardFormData.append("file", blob, fileEntry.filename);

  try {
    // Forward the file to the extraction API (dispatcher extends timeout for slow responses)
    const response = await fetch(`${extractionApiUrl}/extract`, {
      method: "POST",
      body: forwardFormData,
      signal: AbortSignal.timeout(900000), // 15 minutes
      dispatcher: extractionAgent,
    } as RequestInit);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(
        `Extraction API returned HTTP ${response.status}: ${errorText}`,
      );
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      throw createError({
        statusCode: response.status,
        statusMessage:
          errorData.message || `Extraction API returned ${response.status}`,
        data: errorData,
      });
    }

    const rawData = await response.json();

    // Validate the extraction API response
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      throw createError({
        statusCode: 422,
        statusMessage: "Invalid data received from extraction API",
        data: parseResult.error.flatten(),
      });
    }

    const extractedData = parseResult.data;

    const creators = (extractedData.creators ?? []).map((creator) => ({
      name: creator.name ?? "Unknown Creator",
      ...(creator.nameType && { nameType: creator.nameType }),
      ...(creator.nameIdentifiers && {
        nameIdentifiers: creator.nameIdentifiers.map((ni) => ({
          nameIdentifier: ni.nameIdentifier,
          nameIdentifierType: ni.nameIdentifierScheme || null,
          nameIdentifierScheme: ni.nameIdentifierScheme || null,
        })),
      }),
      ...(creator.affiliation && {
        affiliation: creator.affiliation.map((aff) => ({
          name: aff.name,
          affiliationIdentifier: aff.affiliationIdentifier || null,
          affiliationIdentifierScheme: aff.affiliationIdentifierScheme || null,
        })),
      }),
    }));

    const imageCaption = extractedData.imageCaption ?? [];

    const posterContent = extractedData.posterContent?.sections ?? [];
    const tableCaption = extractedData.tableCaption ?? [];
    const titles = extractedData.titles ?? [];
    const descriptions = extractedData.descriptions ?? [];

    const posterTitle = titles[0]?.title ?? "Untitled Poster";
    const posterDescription =
      descriptions[0]?.description ?? "No description provided for this poster";

    const identifiers = extractedData.identifiers ?? [];
    const alternateIdentifiers = extractedData.alternateIdentifiers ?? [];

    const publisher = extractedData.publisher ? [extractedData.publisher] : [];
    const publicationYear = extractedData.publicationYear ?? null;
    const subjects = extractedData.subjects ?? [];
    const dates = extractedData.dates ?? [];
    const language = extractedData.language ?? null;

    const types = extractedData.types ? [extractedData.types] : [];
    const relatedIdentifiers = extractedData.relatedIdentifiers ?? [];
    const sizes = extractedData.sizes ?? [];
    const formats = extractedData.formats ?? [];
    const version = extractedData.version ?? null;
    const rightsList = extractedData.rightsList ?? [];
    const fundingReferences = extractedData.fundingReferences ?? [];
    // ethicsApprovals (plural) from schema, store as ethicsApproval in DB
    const ethicsApproval = extractedData.ethicsApprovals ?? [];

    const conference = extractedData.conference;
    const conferenceName = conference?.conferenceName ?? null;
    const conferenceLocation = conference?.conferenceLocation ?? null;
    const conferenceUri = conference?.conferenceUri ?? null;
    const conferenceIdentifier = conference?.conferenceIdentifier ?? null;
    const conferenceIdentifierType =
      conference?.conferenceIdentifierType ?? null;
    const conferenceSchemaUri = conference?.conferenceSchemaUri ?? null;
    const conferenceStartDate = conference?.conferenceStartDate ?? null;
    const conferenceEndDate = conference?.conferenceEndDate ?? null;
    const conferenceAcronym = conference?.conferenceAcronym ?? null;
    const conferenceSeries = conference?.conferenceSeries ?? null;

    const domain = extractedData.domain ?? "Other";

    // Save the poster to the database
    const poster = await prisma.poster.create({
      data: {
        userId,
        title: posterTitle,
        description: posterDescription,
        imageUrl: faker.image.urlPicsumPhotos({
          width: 400,
          height: 300,
          blur: 0,
        }),
        status: "draft",
        randomInt: faker.number.int(1000000),
        posterMetadata: {
          create: {
            creators,
            titles,
            descriptions,
            imageCaption,
            posterContent,
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
    });

    return {
      posterId: poster.id,
    };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw createError({
        statusCode: 504,
        statusMessage: "Request timed out. Processing may take a while.",
      });
    }

    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
    ) {
      throw error;
    }

    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Error forwarding file to extraction API";

    throw createError({
      statusCode: 500,
      statusMessage: errorMessage,
    });
  }
});
