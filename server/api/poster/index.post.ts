import { faker } from "@faker-js/faker";

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
    // Forward the file to the extraction API
    const response = await fetch(`${extractionApiUrl}/extract`, {
      method: "POST",
      body: forwardFormData,
      // Set a longer timeout for processing (5 minutes)
      signal: AbortSignal.timeout(300000),
    });

    if (!response.ok) {
      const errorText = await response.text();
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

    const extractedData = await response.json();

    const creators =
      "creators" in extractedData
        ? extractedData.creators.map(
            (creator: {
              name: string;
              nameType: string;
              nameIdentifiers: {
                nameIdentifier: string;
                nameIdentifierScheme: string;
                schemeURI: string;
              }[];
              affiliation: {
                name: string;
                affiliationIdentifier: string;
                affiliationIdentifierScheme: string;
                schemeURI: string;
              }[];
            }) => ({
              name:
                "name" in creator && creator.name
                  ? creator.name
                  : "Unknown Creator",
              ...(creator.nameType && { nameType: creator.nameType }),
              ...(creator.nameIdentifiers && {
                nameIdentifiers: creator.nameIdentifiers.map(
                  (nameIdentifier: {
                    nameIdentifier: string;
                    nameIdentifierScheme: string;
                    schemeURI: string;
                  }) => ({ nameIdentifier: nameIdentifier.nameIdentifier }),
                ),
              }),
              ...(creator.affiliation && {
                affiliation: creator.affiliation.map(
                  (affiliation: {
                    name: string;
                    affiliationIdentifier: string;
                    affiliationIdentifierScheme: string;
                    schemeURI: string;
                  }) => ({ name: affiliation.name }),
                ),
              }),
            }),
          )
        : [];

    const imageCaption =
      "imageCaption" in extractedData ? extractedData.imageCaption : [];

    const posterContent =
      "posterContent" in extractedData ? extractedData.posterContent : [];

    const tableCaption =
      "tableCaption" in extractedData ? extractedData.tableCaption : [];

    const titles = "titles" in extractedData ? extractedData.titles : [];

    const descriptions =
      "descriptions" in extractedData ? extractedData.descriptions : [];

    const posterTitle = titles[0]?.title || "Untitled Poster";
    const posterDescription =
      descriptions[0]?.description || "No description provided for this poster";

    const identifiers =
      "identifiers" in extractedData ? extractedData.identifiers : [];

    const alternateIdentifiers =
      "alternateIdentifiers" in extractedData
        ? extractedData.alternateIdentifiers
        : [];

    const publisher =
      "publisher" in extractedData ? extractedData.publisher : [];

    const publicationYear =
      "publicationYear" in extractedData ? extractedData.publicationYear : null;

    const subjects = "subjects" in extractedData ? extractedData.subjects : [];

    const dates = "dates" in extractedData ? extractedData.dates : [];

    const language =
      "language" in extractedData ? extractedData.language : null;

    const types = "types" in extractedData ? extractedData.types : [];

    const relatedIdentifiers =
      "relatedIdentifiers" in extractedData
        ? extractedData.relatedIdentifiers
        : [];

    const sizes = "sizes" in extractedData ? extractedData.sizes : [];

    const formats = "formats" in extractedData ? extractedData.formats : [];

    const version = "version" in extractedData ? extractedData.version : null;

    const rightsList =
      "rightsList" in extractedData ? extractedData.rightsList : [];

    const fundingReferences =
      "fundingReferences" in extractedData
        ? extractedData.fundingReferences
        : [];

    const ethicsApproval =
      "ethicsApproval" in extractedData ? extractedData.ethicsApproval : [];

    const conferenceName =
      "conferenceName" in extractedData ? extractedData.conferenceName : null;
    const conferenceLocation =
      "conferenceLocation" in extractedData
        ? extractedData.conferenceLocation
        : null;
    const conferenceUri =
      "conferenceUri" in extractedData ? extractedData.conferenceUri : null;
    const conferenceIdentifier =
      "conferenceIdentifier" in extractedData
        ? extractedData.conferenceIdentifier
        : null;
    const conferenceIdentifierType =
      "conferenceIdentifierType" in extractedData
        ? extractedData.conferenceIdentifierType
        : null;
    const conferenceSchemaUri =
      "conferenceSchemaUri" in extractedData
        ? extractedData.conferenceSchemaUri
        : null;
    const conferenceStartDate =
      "conferenceStartDate" in extractedData
        ? extractedData.conferenceStartDate
        : null;
    const conferenceEndDate =
      "conferenceEndDate" in extractedData
        ? extractedData.conferenceEndDate
        : null;
    const conferenceAcronym =
      "conferenceAcronym" in extractedData
        ? extractedData.conferenceAcronym
        : null;
    const conferenceSeries =
      "conferenceSeries" in extractedData
        ? extractedData.conferenceSeries
        : null;

    const domain = "domain" in extractedData ? extractedData.domain : "Other";

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
