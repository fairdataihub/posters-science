import { faker } from "@faker-js/faker";
import { Agent } from "undici";
import { schema } from "~~/app/utils/poster_schema";

const extractionAgent = new Agent({
  headersTimeout: 900000, // 15 minutes
  bodyTimeout: 900000, // 15 minutes
});

interface ExtractionResult {
  success: true;
  posterId: number;
}

interface ExtractionError {
  success: false;
  error: string;
}

type ProcessExtractionResult = ExtractionResult | ExtractionError;

/**
 * Process poster extraction in the background.
 * This function calls the extraction API, parses the result, and creates the poster.
 */
export async function processExtraction(
  jobId: string,
  userId: string,
  fileBuffer: Buffer,
  fileName: string,
  fileType: string,
  posterExtractionApi: string,
): Promise<ProcessExtractionResult> {
  try {
    // Update job status to processing
    await prisma.extractionJob.update({
      where: { id: jobId },
      data: { status: "processing" },
    });

    // Create FormData to forward to external API
    const forwardFormData = new FormData();
    // Convert Buffer to Uint8Array for Blob compatibility
    const uint8Array = new Uint8Array(fileBuffer);
    const blob = new Blob([uint8Array], { type: fileType });
    forwardFormData.append("file", blob, fileName);

    // Call the extraction API
    const response = await fetch(`${posterExtractionApi}/extract`, {
      method: "POST",
      body: forwardFormData,
      signal: AbortSignal.timeout(900000), // 15 minutes
      dispatcher: extractionAgent,
    } as RequestInit);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Job ${jobId}] Extraction API returned HTTP ${response.status}: ${errorText}`,
      );
      throw new Error(
        `Extraction API returned ${response.status}: ${errorText}`,
      );
    }

    const rawData = await response.json();

    // Validate the extraction API response
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      console.error(
        `[Job ${jobId}] Invalid data received from extraction API`,
        parseResult.error.flatten(),
      );
      throw new Error("Invalid data received from extraction API");
    }

    const extractedData = parseResult.data;

    // Transform the extracted data
    const creators = (extractedData.creators ?? []).map((creator) => ({
      name: creator.name ?? "Unknown Creator",
      ...(creator.givenName && { givenName: creator.givenName }),
      ...(creator.familyName && { familyName: creator.familyName }),
      ...(creator.nameType && { nameType: creator.nameType }),
      ...(creator.nameIdentifiers && {
        nameIdentifiers: creator.nameIdentifiers.map((ni) => ({
          nameIdentifier: ni.nameIdentifier,
          nameIdentifierType: ni.nameIdentifierScheme || null,
          nameIdentifierScheme: ni.nameIdentifierScheme || null,
        })),
      }),
      ...(creator.affiliation && {
        affiliation: creator.affiliation.map((aff) => {
          if (typeof aff === "string") {
            return { name: aff };
          }

          return {
            name: aff.name,
            affiliationIdentifier: aff.affiliationIdentifier || null,
            affiliationIdentifierScheme:
              aff.affiliationIdentifierScheme || null,
          };
        }),
      }),
    }));

    const imageCaption =
      extractedData.imageCaptions ?? extractedData.imageCaption ?? [];
    const posterContent =
      (extractedData.content ?? extractedData.posterContent)?.sections ?? [];
    const tableCaption =
      extractedData.tableCaptions ?? extractedData.tableCaption ?? [];
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

    const domain =
      extractedData.researchField ?? extractedData.domain ?? "Other";

    // Create the poster in the database
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

    // Update job as completed
    await prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        posterId: poster.id,
      },
    });

    console.log(
      `[Job ${jobId}] Completed successfully, posterId: ${poster.id}`,
    );

    return { success: true, posterId: poster.id };
  } catch (error: unknown) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unknown error during extraction";

    console.error(`[Job ${jobId}] Failed:`, errorMessage);

    // Update job as failed
    await prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: errorMessage,
      },
    });

    return { success: false, error: errorMessage };
  }
}
