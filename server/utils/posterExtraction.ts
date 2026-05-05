import { schema } from "~~/app/utils/poster_schema";

function sanitizeUnknown<T>(value: T): T {
  if (typeof value === "string") {
    return (value.trim().toLowerCase() === "unknown" ? null : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeUnknown) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeUnknown(v)]),
    ) as T;
  }

  return value;
}

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
    });

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

    const extractedData = sanitizeUnknown(parseResult.data);

    // Transform the extracted data
    const creators = (extractedData.creators ?? []).map((creator) => ({
      name: creator.name ?? null,
      ...(creator.givenName && { givenName: creator.givenName }),
      ...(creator.familyName && { familyName: creator.familyName }),
      ...(creator.nameType && { nameType: creator.nameType }),
      ...(creator.nameIdentifiers && {
        nameIdentifiers: creator.nameIdentifiers.map((ni) => ({
          nameIdentifier: ni.nameIdentifier,
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

    const imageCaptions =
      extractedData.imageCaptions ?? extractedData.imageCaption ?? [];
    const tableCaptions =
      extractedData.tableCaptions ?? extractedData.tableCaption ?? [];
    const content = extractedData.content ?? extractedData.posterContent;
    const sections = Array.isArray(content?.sections) ? content.sections : [];
    const posterContent = {
      sections,
      unstructuredContent: content?.unstructuredContent ?? "",
    };
    const titles = extractedData.titles ?? [];
    const descriptions = extractedData.descriptions ?? [];

    const posterTitle = titles[0]?.title ?? "Untitled Poster";
    const posterDescription =
      descriptions[0]?.description ?? "No description provided for this poster";

    const identifiers = extractedData.identifiers ?? [];
    const publisher =
      typeof extractedData.publisher === "string"
        ? extractedData.publisher
        : (extractedData.publisher?.name ?? null);
    const publicationYear = extractedData.publicationYear ?? null;
    const subjectsRaw = extractedData.subjects ?? [];
    const subjects = subjectsRaw.map((s: { subject?: string } | string) =>
      typeof s === "string" ? s : (s?.subject ?? ""),
    );
    const language = extractedData.language ?? null;
    const relatedIdentifiers = extractedData.relatedIdentifiers ?? [];
    const size =
      extractedData.size ??
      (extractedData.sizes as string[] | undefined)?.[0] ??
      null;
    const format =
      extractedData.format ??
      (extractedData.formats as string[] | undefined)?.[0] ??
      null;
    const version = extractedData.version ?? null;
    const license =
      extractedData.license ??
      extractedData.rightsList?.[0]?.rightsIdentifier ??
      extractedData.rightsList?.[0]?.rights ??
      null;
    const fundingReferences = extractedData.fundingReferences ?? [];

    const { conference } = extractedData;
    const conferenceName = conference?.conferenceName ?? null;
    const conferenceLocation = conference?.conferenceLocation ?? null;
    const conferenceUri = conference?.conferenceUri ?? null;
    const conferenceIdentifier = conference?.conferenceIdentifier ?? null;
    const conferenceIdentifierType =
      conference?.conferenceIdentifierType ?? null;
    const conferenceYear = conference?.conferenceYear ?? null;
    const conferenceStartDate = conference?.conferenceStartDate ?? null;
    const conferenceEndDate = conference?.conferenceEndDate ?? null;
    const conferenceAcronym = conference?.conferenceAcronym ?? null;
    const conferenceSeries = conference?.conferenceSeries ?? null;

    const domain =
      extractedData.researchField ?? extractedData.domain ?? "Other";

    // Create the poster in the database (PosterMetadata fields only)
    const poster = await prisma.poster.create({
      data: {
        userId,
        title: posterTitle,
        description: posterDescription,
        imageUrl: "",
        status: "draft",
        randomInt: Math.floor(Math.random() * 1000000),
        posterMetadata: {
          create: {
            doi: extractedData.doi ?? null,
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
