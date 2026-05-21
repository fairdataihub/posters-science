import { buildPosterJson } from "./buildPosterJson";
const config = useRuntimeConfig();

/**
 * Extracts a useful error string from a failed Zenodo API response,
 * including the response body which contains validation details.
 */
async function getZenodoErrorMessage(
  operation: string,
  response: Response,
): Promise<string> {
  let body = "";

  try {
    body = await response.text();
  } catch {
    // ignore body read errors
  }

  return `${operation}: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`;
}

async function getZenodoToken(userId: string) {
  console.log(`[Zenodo] Looking up token for user: ${userId}`);
  const tokenRecord = await prisma.zenodoToken.findUnique({
    where: {
      userId,
    },
  });

  if (!tokenRecord) {
    console.log(`[Zenodo] No token found for user: ${userId}`);

    return null;
  }

  console.log(`[Zenodo] Token found for user: ${userId}`);

  return tokenRecord;
}

export async function validateZenodoToken(userId: string) {
  console.log(`[Zenodo] Validating token for user: ${userId}`);

  let message = "";
  let zenodoToken = false;
  const existingDepositions = [];
  const tokenRecord = await getZenodoToken(userId);

  if (tokenRecord) {
    // Token exists, ensure is still valid
    console.log("[Zenodo] Checking token validity against Zenodo API");

    const zenodoTokenInfo = await fetch(
      `${config.zenodoApiEndpoint}/deposit/depositions`,
      {
        headers: {
          Authorization: `Bearer ${tokenRecord.accessToken}`,
        },
      },
    );

    if (!zenodoTokenInfo.ok) {
      // Token invalid or expired
      console.log(
        `[Zenodo] Token invalid or expired (status: ${zenodoTokenInfo.status}), deleting token`,
      );

      message = "Zenodo token is invalid or expired";
      await prisma.zenodoToken.delete({
        where: {
          userId,
        },
      });
    } else {
      // Token valid - refresh it to extend the session
      console.log("[Zenodo] Token valid, refreshing to extend session");

      await refreshZenodoToken(userId, tokenRecord.refreshToken);

      zenodoToken = true;
      message = "Zenodo token is valid";

      const responseData = await zenodoTokenInfo.json();

      console.log(`[Zenodo] Found ${responseData.length} existing depositions`);

      for (const deposition of responseData) {
        existingDepositions.push({
          id: deposition.id,
          title: deposition.metadata.title,
          state: deposition.state,
          submitted: deposition.submitted,
          conceptrecid: deposition.conceptrecid,
        });
      }
    }
  } else {
    console.log(`[Zenodo] No token found for user: ${userId}`);

    message = "No Zenodo token found";
  }

  console.log(`[Zenodo] Validation result: ${message}`);

  return { zenodoToken, message, existingDepositions };
}

async function refreshZenodoToken(userId: string, refreshToken: string) {
  console.log(`[Zenodo] Refreshing token for user: ${userId}`);

  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.zenodoClientId,
    client_secret: config.zenodoClientSecret,
  });

  const refresh = await fetch(`${config.zenodoEndpoint}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: refreshBody.toString(),
  });

  if (refresh.ok) {
    console.log("[Zenodo] Token refreshed successfully");

    const { access_token, refresh_token, expires_in } = await refresh.json();

    await prisma.zenodoToken.update({
      where: { userId },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      },
    });
  } else {
    console.log(`[Zenodo] Token refresh failed (status: ${refresh.status})`);
  }
}

export type PublicationProgressEvent = {
  step: string;
  status: "in_progress" | "completed" | "error";
  message: string;
};

type ProgressCallback = (
  event: PublicationProgressEvent,
) => void | Promise<void>;

type PosterIdentifier = { identifier: string; identifierType: string };

function extractOrcid(ni: {
  nameIdentifier: string;
  nameIdentifierScheme?: string;
  schemeURI?: string;
}): string | undefined {
  const { nameIdentifier, nameIdentifierScheme, schemeURI } = ni;
  if (!nameIdentifier) return undefined;

  if (nameIdentifier.toLowerCase().includes("orcid.org/")) {
    return nameIdentifier.replace(/.*orcid\.org\//i, "").trim() || undefined;
  }

  const isOrcid =
    nameIdentifierScheme?.toLowerCase() === "orcid" ||
    schemeURI?.toLowerCase().includes("orcid.org");

  return isOrcid ? nameIdentifier : undefined;
}

function extractRorId(
  affiliationIdentifier: string | undefined,
  scheme: string | undefined,
): string | undefined {
  if (!affiliationIdentifier) return undefined;
  const isRor =
    scheme?.toLowerCase() === "ror" ||
    affiliationIdentifier.toLowerCase().includes("ror.org/");
  if (!isRor) return undefined;

  return affiliationIdentifier.replace(/.*ror\.org\//i, "").trim() || undefined;
}

export async function beginZenodoPublication(
  posterId: string,
  mode: string,
  existingDepositionId: number | undefined,
  userId: string,
  onProgress?: ProgressCallback,
  license?: string,
) {
  console.log(
    `[Zenodo] Beginning publication for poster: ${posterId}, mode: ${mode}, depositionId: ${existingDepositionId}`,
  );

  if (mode === "existing" && !existingDepositionId) {
    console.log("[Zenodo] Missing deposition ID for existing mode");

    return {
      success: false,
      error: "Existing deposition ID is required for 'existing' mode",
    };
  }

  // Get the user's Zenodo token
  const tokenRecord = await getZenodoToken(userId);

  if (!tokenRecord) {
    console.log("[Zenodo] No token found, aborting publication");

    return { success: false, error: "Zenodo token not found for user" };
  }

  // Step 1: Prepare deposition
  await onProgress?.({
    step: "deposition",
    status: "in_progress",
    message: "Preparing deposition...",
  });

  console.log("[Zenodo] Getting working deposition");

  const status = await getWorkingDeposition(
    mode,
    existingDepositionId!,
    tokenRecord.accessToken,
  );

  if (!status.success) {
    console.log(
      `[Zenodo] Failed to get working deposition: ${JSON.stringify(status.error)}`,
    );

    return { success: false, error: status.error };
  }

  const deposition = status.data;

  // Set the bucket url and doi (using record_id over id because it is the id of the current deposition)
  // const addUploadType = !!deposition?.metadata?.upload_type;
  const newDepositionId = deposition.record_id;
  const bucketUrl = deposition.links.bucket;
  const { doi } = deposition.metadata.prereserve_doi;

  const draftUrl = `${config.zenodoEndpoint}/deposit/${newDepositionId}`;

  console.log(
    `[Zenodo] Working deposition ready - id: ${newDepositionId}, doi: ${doi}, bucket: ${bucketUrl}`,
  );
  console.log(`[Zenodo] Draft URL: ${draftUrl}`);

  // Update zenodoDeposition information
  const posterInt = parseInt(posterId);
  const zenResponse = await prisma.zenodoDeposition.findFirst({
    where: {
      posterId: posterInt,
    },
  });

  if (zenResponse) {
    await prisma.zenodoDeposition.update({
      where: { id: zenResponse.id },
      data: {
        lastPublishedZenodoDoi: zenResponse.lastPublishedZenodoDoi || "",
        status: "draft",
        posterId: posterInt,
        userId,
        depositionId: newDepositionId,
      },
    });
  } else {
    await prisma.zenodoDeposition.create({
      data: {
        status: "draft",
        posterId: posterInt,
        userId,
        depositionId: newDepositionId,
      },
    });
  }

  await onProgress?.({
    step: "deposition",
    status: "completed",
    message: "Deposition ready",
  });

  // Step 2: Load poster data
  await onProgress?.({
    step: "metadata",
    status: "in_progress",
    message: "Loading poster data...",
  });

  // Fetch poster with metadata from DB
  console.log(`[Zenodo] Fetching poster and metadata for: ${posterId}`);

  const poster = await prisma.poster.findUnique({
    where: { id: parseInt(posterId) },
    include: { posterMetadata: true },
  });

  if (!poster || !poster.posterMetadata) {
    console.log(`[Zenodo] Poster or metadata not found for: ${posterId}`);

    return { success: false, error: "Poster or metadata not found" };
  }

  // Persist license to DB if provided so poster.json and the record stay in sync
  if (license) {
    console.log(`[Zenodo] Saving license to posterMetadata: ${license}`);

    await prisma.posterMetadata.update({
      where: { posterId: parseInt(posterId) },
      data: { license },
    });

    poster.posterMetadata.license = license;
  }

  await onProgress?.({
    step: "metadata",
    status: "completed",
    message: "Poster data loaded",
  });

  // Step 3: Update deposition metadata
  await onProgress?.({
    step: "upload_metadata",
    status: "in_progress",
    message: "Updating metadata on Zenodo...",
  });

  // Build Zenodo deposition metadata from poster data
  const meta = poster.posterMetadata;

  const metaIdentifiers: PosterIdentifier[] = Array.isArray(meta.identifiers)
    ? (meta.identifiers as PosterIdentifier[])
    : [];

  const creators = meta.creators as InvenioCreator[];

  const posterLicense = meta.license;

  const keywords = (meta.subjects ?? []).filter((s: string) => s !== "");

  const rawRelated = meta.relatedIdentifiers as {
    relatedIdentifier?: string;
    relatedIdentifierType?: string;
    relationType?: string;
    resourceTypeGeneral?: string;
  }[];
  const zenodoRelated = Array.isArray(rawRelated)
    ? rawRelated
        .filter(
          (r) =>
            r.relatedIdentifier && r.relatedIdentifierType && r.relationType,
        )
        .map((r) => ({
          identifier: r.relatedIdentifier!,
          scheme: r.relatedIdentifierType!.toLowerCase(),
          relation:
            r.relationType!.charAt(0).toLowerCase() + r.relationType!.slice(1),
        }))
    : [];

  const rawFunding = meta.fundingReferences as {
    funderName?: string;
    funderIdentifier?: string;
    funderIdentifierType?: string;
    awardNumber?: string;
    awardTitle?: string;
  }[];

  const conferenceDates =
    meta.conferenceStartDate && meta.conferenceEndDate
      ? `${meta.conferenceStartDate} - ${meta.conferenceEndDate}`
      : meta.conferenceStartDate ||
        meta.conferenceEndDate ||
        (meta.conferenceYear ? String(meta.conferenceYear) : undefined);
  const currentPublicationYear = new Date().getFullYear();

  // Validate grants against Zenodo's OpenAIRE awards database
  const candidateGrants = Array.isArray(rawFunding)
    ? rawFunding.filter((f) => f.awardNumber?.trim())
    : [];

  const zenodoGrants: { id: string }[] = [];

  for (const grant of candidateGrants) {
    const awardNumber = grant.awardNumber!.trim();

    const awardsRes = await fetch(
      `${config.zenodoApiEndpoint}/awards?q=${encodeURIComponent(awardNumber)}&size=5`,
    ).catch(() => null);

    const awardsData = awardsRes?.ok
      ? await awardsRes.json().catch(() => null)
      : null;
    const match = awardsData?.hits?.hits?.find(
      (a: { id: string; number: string; funder?: { name?: string } }) =>
        a.number === awardNumber,
    );

    if (match) {
      console.log(
        `[Zenodo] Grant validated: "${match.id}" (${match.funder?.name})`,
      );
      zenodoGrants.push({ id: match.id });
    } else {
      console.log(
        `[Zenodo] Skipping grant with award "${awardNumber}" - not found in Zenodo's awards database`,
      );
    }
  }

  const metadata = {
    metadata: {
      title: poster.title,
      upload_type: "poster",
      publication_type: "poster",
      creators: creators.map((c) => {
        const orcid = c.nameIdentifiers?.map(extractOrcid).find(Boolean);
        const name =
          c.name ||
          [c.familyName, c.givenName].filter(Boolean).join(", ") ||
          "";

        return {
          name,
          ...(c.affiliation?.[0]?.name && {
            affiliation: c.affiliation[0].name,
          }),
          ...(orcid && { orcid }),
        };
      }),
      description: poster.description,
      prereserve_doi: { doi },
      ...(posterLicense && { license: posterLicense }),
      ...(keywords.length > 0 && { keywords }),
      ...(meta.language && { language: meta.language }),
      ...(zenodoRelated.length > 0 && { related_identifiers: zenodoRelated }),
      ...(meta.conferenceName && { conference_title: meta.conferenceName }),
      ...(meta.conferenceAcronym && {
        conference_acronym: meta.conferenceAcronym,
      }),
      ...(meta.conferenceLocation && {
        conference_place: meta.conferenceLocation,
      }),
      ...(meta.conferenceUri && { conference_url: meta.conferenceUri }),
      ...(conferenceDates && { conference_dates: conferenceDates }),
      ...(meta.version && { version: meta.version }),
      publication_date: `${currentPublicationYear}`,
      ...(zenodoGrants.length > 0 && { grants: zenodoGrants }),
    },
  };

  console.log(`[Zenodo] Updating metadata for deposition: ${newDepositionId}`);
  console.log(`[Zenodo] Grants being sent: ${JSON.stringify(zenodoGrants)}`);

  let metadataResult = await updateDepositionMetadata(
    newDepositionId,
    tokenRecord.accessToken,
    metadata,
  );

  // Zenodo validates grant IDs against its internal OpenAIRE database and rejects the
  // entire metadata PUT if any grant is unrecognised. Retry without grants so publication
  // still succeeds.
  if (
    !metadataResult.success &&
    metadataResult.error?.includes("Invalid value") &&
    zenodoGrants.length > 0
  ) {
    console.log(
      `[Zenodo] One or more grants not found in Zenodo's OpenAIRE database, retrying without grants. Dropped: ${JSON.stringify(zenodoGrants)}`,
    );

    const metadataWithoutGrants = {
      metadata: { ...metadata.metadata, grants: undefined },
    };

    metadataResult = await updateDepositionMetadata(
      newDepositionId,
      tokenRecord.accessToken,
      metadataWithoutGrants,
    );
  }

  if (!metadataResult.success) {
    return { success: false, error: metadataResult.error };
  }

  // After the legacy metadata write succeeds, enrich creator affiliations with ROR links
  // by reading back what Zenodo stored and patching only the affiliations field.
  // The publication proceeds regardless of whether this step succeeds.
  const posterContentObj = meta.posterContent as {
    submissionAbstract?: string;
  } | null;

  await patchCreatorAffiliationsRdm(
    newDepositionId,
    tokenRecord.accessToken,
    creators,
    posterLicense,
    {
      submissionAbstract: posterContentObj?.submissionAbstract,
      rawFunding,
      dbRelated: Array.isArray(rawRelated) ? rawRelated : [],
    },
  );

  const zenodoVersion = metadataResult.data?.metadata?.version;
  if (zenodoVersion) {
    meta.version = zenodoVersion;
  } else if (!meta.version) {
    meta.version = mode === "new" ? "1" : null;
  } else if (mode === "existing") {
    const prev = parseInt(meta.version, 10);
    if (!isNaN(prev)) {
      meta.version = String(prev + 1);
    }
  }

  await onProgress?.({
    step: "upload_metadata",
    status: "completed",
    message: "Metadata updated",
  });

  // Step 4: Upload files
  await onProgress?.({
    step: "upload_files",
    status: "in_progress",
    message: "Uploading poster files...",
  });

  // Build poster.json from DB data and upload to Zenodo bucket
  console.log(`[Zenodo] Building poster.json for poster: ${posterId}`);

  poster.posterMetadata.publisher = "Zenodo";

  const posterJson = buildPosterJson(poster.posterMetadata, {
    title: poster.title,
    description: poster.description,
    zenodoDoi: doi,
    publishedAt: poster.created,
  });
  const posterJsonBlob = new Blob([JSON.stringify(posterJson, null, 2)], {
    type: "application/json",
  });

  console.log(`[Zenodo] Uploading poster.json to bucket: ${bucketUrl}`);

  const uploadResult = await uploadFileToZenodoBucket(
    bucketUrl,
    tokenRecord.accessToken,
    "poster.json",
    posterJsonBlob,
  );

  if (!uploadResult.success) {
    console.log(`[Zenodo] Failed to upload poster.json: ${uploadResult.error}`);

    return { success: false, error: uploadResult.error };
  }

  // Retrieve and upload poster file
  const extractionJob = await prisma.extractionJob.findUnique({
    where: { posterId: posterInt },
  });

  if (!extractionJob?.filePath) {
    console.log(
      `[Zenodo] No extraction job or file path found for poster: ${posterId}`,
    );

    return { success: false, error: "Poster file not found for upload" };
  }

  console.log(
    `[Zenodo] Fetching poster file from BunnyCDN: ${extractionJob.filePath}`,
  );

  const posterFileRes = await fetch(
    `${config.bunnyPrivateStorage}/${extractionJob.filePath}`,
    { headers: { AccessKey: config.bunnyPrivateStorageKey } },
  );

  if (!posterFileRes.ok) {
    console.log(
      `[Zenodo] Failed to fetch poster file from BunnyCDN: ${posterFileRes.status}`,
    );

    return {
      success: false,
      error: "Failed to retrieve poster file from storage",
    };
  }

  const posterFileName = extractionJob.fileName || "poster.pdf";
  const posterFileContentLength = posterFileRes.headers.get("Content-Length");

  console.log(
    `[Zenodo] Uploading poster file "${posterFileName}" to bucket: ${bucketUrl}`,
  );

  const posterFileUploadRes = await fetch(`${bucketUrl}/${posterFileName}`, {
    method: "PUT",
    // @ts-expect-error required when body is a ReadableStream
    duplex: "half",
    headers: {
      "Content-Type": "application/octet-stream",
      ...(posterFileContentLength
        ? { "Content-Length": posterFileContentLength }
        : {}),
      Authorization: `Bearer ${tokenRecord.accessToken}`,
    },
    body: posterFileRes.body,
  });

  if (!posterFileUploadRes.ok) {
    console.log(
      `[Zenodo] Failed to upload poster file "${posterFileName}" (status: ${posterFileUploadRes.status})`,
    );

    const errorMsg = await getZenodoErrorMessage(
      `Failed to upload file "${posterFileName}"`,
      posterFileUploadRes,
    );

    return { success: false, error: errorMsg };
  }

  console.log(`[Zenodo] Uploaded poster file "${posterFileName}" successfully`);

  await onProgress?.({
    step: "upload_files",
    status: "completed",
    message: "Files uploaded",
  });

  // Step 5: Publish
  await onProgress?.({
    step: "publish",
    status: "in_progress",
    message: "Publishing to Zenodo...",
  });

  // Publish the deposition
  console.log(`[Zenodo] About to publish deposition: ${newDepositionId}`);
  console.log(`[Zenodo] Inspect draft before publish: ${draftUrl}`);

  const publishResult = await publishZenodoDeposition(
    tokenRecord.accessToken,
    newDepositionId,
  );

  if (!publishResult.success) {
    console.log(
      `[Zenodo] Publication failed for deposition: ${newDepositionId}`,
    );

    return { success: false, error: publishResult.error };
  }

  // Ensure we update the record for this poster if one exists, otherwise create a new one
  const existing = await prisma.zenodoDeposition.findFirst({
    where: { posterId: posterInt },
  });

  if (existing) {
    await prisma.zenodoDeposition.update({
      where: { id: existing.id },
      data: {
        lastPublishedZenodoDoi: publishResult.data.doi,
        status: "published",
        posterId: posterInt,
        userId,
        depositionId: publishResult.data.id,
      },
    });
  } else {
    await prisma.zenodoDeposition.create({
      data: {
        lastPublishedZenodoDoi: publishResult.data.doi,
        status: "published",
        posterId: posterInt,
        userId,
        depositionId: publishResult.data.id,
      },
    });
  }

  // Move thumbnail from private to public storage before publishing
  const posterWithImage = await prisma.poster.findUnique({
    where: { id: posterInt },
    select: { imageUrl: true },
  });

  let newImageUrl: string | undefined;

  const {
    bunnyPrivateStorage,
    bunnyPrivateStorageKey,
    bunnyPublicStorage,
    bunnyPublicStorageKey,
  } = config;

  const imageUrl = posterWithImage?.imageUrl;
  if (
    imageUrl &&
    bunnyPrivateStorage &&
    imageUrl.startsWith(bunnyPrivateStorage)
  ) {
    const thumbnailPath = imageUrl
      .slice(bunnyPrivateStorage.length)
      .replace(/^\//, "");

    if (bunnyPrivateStorageKey && bunnyPublicStorage && bunnyPublicStorageKey) {
      try {
        const downloadRes = await fetch(
          `${bunnyPrivateStorage}/${thumbnailPath}`,
          { headers: { AccessKey: bunnyPrivateStorageKey } },
        );

        if (downloadRes.ok) {
          const contentType =
            downloadRes.headers.get("Content-Type") ?? "image/jpeg";
          const fileBuffer = await downloadRes.arrayBuffer();

          const uploadRes = await fetch(
            `${bunnyPublicStorage}/${thumbnailPath}`,
            {
              method: "PUT",
              headers: {
                AccessKey: bunnyPublicStorageKey,
                "Content-Type": contentType,
                "Content-Length": String(fileBuffer.byteLength),
              },
              body: fileBuffer,
            },
          );

          if (uploadRes.ok) {
            newImageUrl = `https://cdn.posters.science/${thumbnailPath}`;
          } else {
            console.error(
              `[Zenodo] Failed to upload thumbnail to public storage: ${uploadRes.status}`,
            );
          }
        } else {
          console.error(
            `[Zenodo] Failed to download thumbnail from private storage: ${downloadRes.status}`,
          );
        }
      } catch (err) {
        console.error("[Zenodo] Error moving thumbnail:", err);
      }
    }
  }

  await prisma.poster.update({
    where: { id: posterInt },
    data: {
      status: "published",
      publishedAt: new Date(),
      ...(newImageUrl && { imageUrl: newImageUrl }),
    },
  });

  const publishedDoi = publishResult.data.doi;

  if (!publishedDoi) {
    console.error(
      `[Zenodo] Published deposition ${newDepositionId} is missing a DOI in the response`,
    );

    return { success: false, error: "Published deposition is missing a DOI" };
  }

  const alreadyHasDoi = metaIdentifiers.some(
    (i) => i.identifier === publishedDoi && i.identifierType === "DOI",
  );
  const updatedIdentifiers: PosterIdentifier[] = alreadyHasDoi
    ? metaIdentifiers
    : [{ identifier: publishedDoi, identifierType: "DOI" }, ...metaIdentifiers];

  await prisma.posterMetadata.update({
    where: { posterId: posterInt },
    data: {
      doi: publishedDoi,
      publisher: "Zenodo",
      identifiers: updatedIdentifiers,
      ...(meta.version && { version: meta.version }),
    },
  });

  await onProgress?.({
    step: "publish",
    status: "completed",
    message: "Published!",
  });

  console.log(
    `[Zenodo] Publication successful for deposition: ${newDepositionId}`,
  );

  return { success: true, data: publishResult.data };
}

async function createZenodoDeposition(zenodoToken: string) {
  console.log("[Zenodo] Creating new deposition");

  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/deposit/depositions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${zenodoToken}`,
        },
        body: JSON.stringify({}),
      },
    );

    if (!response.ok) {
      const errorMsg = await getZenodoErrorMessage(
        "Failed to create deposition",
        response,
      );

      console.log(`[Zenodo] ${errorMsg}`);

      return { success: false, error: errorMsg };
    }

    const data = await response.json();

    console.log(`[Zenodo] New deposition created (id: ${data.id})`);

    return { success: true, data };
  } catch (error) {
    console.log("[Zenodo] Failed to create deposition:", error);

    return {
      success: false,
      error: `Failed to create deposition: ${(error as Error).message}`,
    };
  }
}

async function getZenodoDeposition(depositionId: number, zenodoToken: string) {
  console.log(`[Zenodo] Fetching deposition: ${depositionId}`);

  try {
    // Will return 404 if the depositionId is a draft and in the "unsubmitted" state
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${depositionId}/versions/latest`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${zenodoToken}`,
        },
      },
    );

    if (response.status === 404) {
      // Check if the deposition is a draft already and return that
      console.log(
        `[Zenodo] Deposition ${depositionId} not found as record, checking as draft`,
      );

      const draftResponse = await fetch(
        `${config.zenodoApiEndpoint}/deposit/depositions/${depositionId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${zenodoToken}`,
          },
        },
      );

      if (!draftResponse.ok) {
        // Deposition not found
        console.log(
          `[Zenodo] Deposition ${depositionId} not found as draft either`,
        );

        return {
          success: false,
          error: `Deposition with ID ${depositionId} not found`,
        };
      }

      console.log(`[Zenodo] Found deposition ${depositionId} as draft`);

      return { success: true, data: await draftResponse.json() };
    }

    console.log(`[Zenodo] Found deposition ${depositionId} as record`);

    return { success: true, data: await response.json() };
  } catch (error) {
    console.log(`[Zenodo] Error fetching deposition ${depositionId}:`, error);

    return {
      success: false,
      error: `Failed to fetch deposition ${depositionId}: ${(error as Error).message}`,
    };
  }
}

async function deleteFileFromZenodo(
  depositionId: number,
  zenodoToken: string,
  filename: string,
) {
  console.log(
    `[Zenodo] Deleting file "${filename}" from deposition: ${depositionId}`,
  );

  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${depositionId}/draft/files/${filename}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${zenodoToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorMsg = await getZenodoErrorMessage(
        `Failed to delete file "${filename}"`,
        response,
      );

      console.log(`[Zenodo] ${errorMsg}`);

      return { success: false, error: errorMsg };
    }

    console.log(`[Zenodo] Deleted file "${filename}" successfully`);

    return { success: true };
  } catch (error) {
    console.log(`[Zenodo] Error deleting file "${filename}":`, error);

    return {
      success: false,
      error: `Failed to delete file "${filename}": ${(error as Error).message}`,
    };
  }
}

async function updateDepositionMetadata(
  depositionId: number,
  zenodoToken: string,
  metadata: object,
) {
  console.log(`[Zenodo] Updating metadata for deposition: ${depositionId}`);

  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/deposit/depositions/${depositionId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${zenodoToken}`,
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!response.ok) {
      const errorMsg = await getZenodoErrorMessage(
        "Failed to update metadata",
        response,
      );

      console.log(`[Zenodo] ${errorMsg}`);

      return { success: false, error: errorMsg };
    }

    const updatedData = await response.json();

    console.log(`[Zenodo] Metadata updated for deposition: ${depositionId}`);

    return { success: true, data: updatedData };
  } catch (error) {
    console.log("[Zenodo] Error updating metadata:", error);

    return {
      success: false,
      error: `Failed to update metadata: ${(error as Error).message}`,
    };
  }
}

type InvenioCreator = {
  name?: string;
  givenName?: string;
  familyName?: string;
  nameType?: string;
  affiliation?: {
    name: string;
    affiliationIdentifier?: string;
    affiliationIdentifierScheme?: string;
  }[];
  nameIdentifiers?: {
    nameIdentifier: string;
    nameIdentifierScheme?: string;
    schemeURI?: string;
  }[];
};

// ORCID format: 4 groups of 4 digits, last char may be X
const ORCID_PATTERN = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

// ISO 7064 mod 11,2 checksum used by ORCID
function validateOrcidChecksum(bare: string): boolean {
  const digits = bare.replace(/-/g, "");
  let total = 0;
  for (let i = 0; i < 15; i++) total = (total + parseInt(digits[i]!, 10)) * 2;
  const expected = (12 - (total % 11)) % 11;

  return digits[15] === (expected === 10 ? "X" : String(expected));
}

// Build InvenioRDM-format creator objects from DB creator data.
// DB data has full structured creators; legacy draft only has combined name strings.
function buildRdmCreators(
  dbCreators: InvenioCreator[],
  options?: { skipRorIds?: boolean },
) {
  const skipIds = options?.skipRorIds ?? false;

  return dbCreators.map((c) => {
    const isOrg = c.nameType?.toLowerCase() === "organizational";

    const orcidRaw = c.nameIdentifiers?.map(extractOrcid).find(Boolean);
    const orcidBare = orcidRaw?.replace(/^https?:\/\/orcid\.org\//i, "").trim();
    const orcid =
      orcidBare &&
      ORCID_PATTERN.test(orcidBare) &&
      validateOrcidChecksum(orcidBare)
        ? orcidBare
        : undefined;

    if (orcidRaw && !orcid) {
      console.warn(
        `[Zenodo] RDM affiliation patch: dropping invalid ORCID "${orcidRaw}" (failed format/checksum)`,
      );
    }

    const affiliations = (c.affiliation ?? [])
      .filter((a) => a.name?.trim())
      .map((a) => {
        const rorId = skipIds
          ? undefined
          : extractRorId(
              a.affiliationIdentifier,
              a.affiliationIdentifierScheme,
            );

        return { name: a.name, ...(rorId && { id: rorId }) };
      });

    if (isOrg) {
      return {
        person_or_org: {
          type: "organizational" as const,
          name: c.name || c.familyName || "",
          ...(orcid && {
            identifiers: [{ scheme: "orcid", identifier: orcid }],
          }),
        },
        ...(affiliations.length > 0 && { affiliations }),
      };
    }

    let familyName = c.familyName;
    let givenName = c.givenName;
    if (!familyName && !givenName && c.name) {
      const commaIdx = c.name.indexOf(",");
      if (commaIdx !== -1) {
        familyName = c.name.slice(0, commaIdx).trim();
        givenName = c.name.slice(commaIdx + 1).trim();
      } else {
        familyName = c.name.trim();
      }
    }

    return {
      person_or_org: {
        type: "personal" as const,
        ...(familyName && { family_name: familyName }),
        ...(givenName && { given_name: givenName }),
        ...(orcid && { identifiers: [{ scheme: "orcid", identifier: orcid }] }),
      },
      ...(affiliations.length > 0 && { affiliations }),
    };
  });
}

// DataCite resourceTypeGeneral → InvenioRDM resource_type.id (conservative mapping)
const DATACITE_TO_INVENIORDM_TYPE: Record<string, string> = {
  Audiovisual: "video",
  Book: "publication-book",
  BookChapter: "publication-section",
  ComputationalNotebook: "software-computationalnotebook",
  ConferencePaper: "publication-conferencepaper",
  Dataset: "dataset",
  Dissertation: "publication-thesis",
  Image: "image",
  JournalArticle: "publication-article",
  Preprint: "publication-preprint",
  Report: "publication-report",
  Software: "software",
  Other: "other",
};

type RdmExtras = {
  skipRorIds?: boolean;
  skipFunderIds?: boolean;
  submissionAbstract?: string;
  rawFunding?: {
    funderName?: string;
    funderIdentifier?: string;
    funderIdentifierType?: string;
    awardNumber?: string;
    awardTitle?: string;
  }[];
  dbRelated?: {
    relatedIdentifier?: string;
    relatedIdentifierType?: string;
    relationType?: string;
    resourceTypeGeneral?: string;
  }[];
};

// Converts a legacy-API draft response to a valid InvenioRDM PUT payload.
// Each legacy field is explicitly remapped - unknown legacy fields are dropped
// rather than spread, which prevents InvenioRDM from silently discarding them.
// posterLicense should be passed from the DB (SPDX format, e.g. "CC0-1.0") so we
// never rely on the legacy draft's license ID, which uses different identifiers
// (e.g. "cc-zero" instead of "cc0-1.0").
function convertLegacyDraftToRdmPayload(
  legacyDraft: Record<string, unknown>,
  dbCreators: InvenioCreator[],
  posterLicense: string | null | undefined,
  options?: RdmExtras,
): object {
  const meta = (legacyDraft.metadata ?? {}) as Record<string, unknown>;

  const rdmCreators = buildRdmCreators(dbCreators, options);

  // keywords[] → subjects[{subject}]
  const keywords = (meta.keywords as string[] | undefined) ?? [];

  // "eng" / "en" string → [{id: "eng"}]
  const language = meta.language as string | undefined;

  // Use the DB license in SPDX format (lowercased). We never read the license
  // from the legacy draft because it uses Zenodo's internal identifiers
  // (e.g. "cc-zero") that InvenioRDM rejects, and the InvenioRDM draft's
  // rights[] field only exists after a successful prior RDM PUT. If the DB
  // has no license, omit rights from the payload rather than risk sending a
  // bad value.
  const licenseId = posterLicense ? posterLicense.toLowerCase() : undefined;

  // {type: "poster"} → {id: "poster"}
  const resourceTypeId =
    (meta.resource_type as { type?: string } | undefined)?.type ?? "poster";

  // Related identifiers: prefer DB entries (have resourceTypeGeneral); fall back to legacy draft
  const rdmRelated = (() => {
    if (options?.dbRelated && options.dbRelated.length > 0) {
      return options.dbRelated
        .filter(
          (r) =>
            r.relatedIdentifier && r.relatedIdentifierType && r.relationType,
        )
        .filter((r) => {
          const scheme = r.relatedIdentifierType!.toLowerCase();
          const id = r.relatedIdentifier!;
          if (scheme === "url") return /^https?:\/\//.test(id);
          if (scheme === "doi") return /^10\.\d{4,}\//.test(id);

          return true;
        })
        .map((r) => {
          const rdmType = r.resourceTypeGeneral
            ? DATACITE_TO_INVENIORDM_TYPE[r.resourceTypeGeneral]
            : undefined;

          return {
            identifier: r.relatedIdentifier!,
            scheme: r.relatedIdentifierType!.toLowerCase(),
            relation_type: { id: r.relationType!.toLowerCase() },
            ...(rdmType && { resource_type: { id: rdmType } }),
          };
        });
    }
    // Legacy draft fallback
    const legacyRelated =
      (meta.related_identifiers as
        | { identifier?: string; scheme?: string; relation?: string }[]
        | undefined) ?? [];

    return legacyRelated
      .filter((r) => r.identifier && r.scheme && r.relation)
      .filter((r) => {
        const scheme = r.scheme!.toLowerCase();
        const id = r.identifier!;
        if (scheme === "url") return /^https?:\/\//.test(id);
        if (scheme === "doi") return /^10\.\d{4,}\//.test(id);

        return true;
      })
      .map((r) => ({
        identifier: r.identifier!,
        scheme: r.scheme!.toLowerCase(),
        relation_type: { id: r.relation!.toLowerCase() },
      }));
  })();

  // Funding: build from DB entries directly (no OpenAIRE pre-validation needed)
  const funding = (options?.rawFunding ?? [])
    .filter((f) => f.funderName?.trim())
    .map((f) => {
      const rorId = options?.skipFunderIds
        ? undefined
        : extractRorId(f.funderIdentifier, f.funderIdentifierType);
      const entry: Record<string, unknown> = {
        funder: { name: f.funderName, ...(rorId && { id: rorId }) },
      };
      if (f.awardNumber?.trim()) {
        entry.award = {
          number: f.awardNumber,
          ...(f.awardTitle?.trim() && { title: { en: f.awardTitle } }),
        };
      }

      return entry;
    });

  // Additional descriptions: submission abstract as InvenioRDM "abstract" type
  const additionalDescriptions = options?.submissionAbstract
    ? [{ description: options.submissionAbstract, type: { id: "abstract" } }]
    : [];

  // meeting is already in the right shape for custom_fields
  const meeting = meta.meeting as Record<string, string> | undefined;
  const customFields: Record<string, unknown> = {};
  if (meeting && Object.keys(meeting).length > 0) {
    customFields["meeting:meeting"] = meeting;
  }

  return {
    metadata: {
      title: meta.title,
      description: meta.description,
      publication_date: meta.publication_date,
      resource_type: { id: resourceTypeId },
      publisher: "Zenodo",
      creators: rdmCreators,
      ...(keywords.length > 0 && {
        subjects: keywords.map((kw) => ({ subject: kw })),
      }),
      ...(language && { languages: [{ id: language }] }),
      ...(licenseId && { rights: [{ id: licenseId }] }),
      ...(rdmRelated.length > 0 && { related_identifiers: rdmRelated }),
      ...(funding.length > 0 && { funding }),
      ...(additionalDescriptions.length > 0 && {
        additional_descriptions: additionalDescriptions,
      }),
    },
    ...(Object.keys(customFields).length > 0 && {
      custom_fields: customFields,
    }),
  };
}

// After the legacy metadata write succeeds, builds a proper InvenioRDM payload
// by converting the legacy draft fields + DB creators, then PUTs via the RDM API
// to get ROR-linked affiliations, funding, and additional descriptions.
async function patchCreatorAffiliationsRdm(
  depositionId: number,
  zenodoToken: string,
  creators: InvenioCreator[],
  posterLicense: string | null | undefined,
  extras?: Pick<RdmExtras, "submissionAbstract" | "rawFunding" | "dbRelated">,
) {
  const hasRorAffiliation = creators.some((c) =>
    c.affiliation?.some((a) =>
      extractRorId(a.affiliationIdentifier, a.affiliationIdentifierScheme),
    ),
  );
  const hasAbstract = !!extras?.submissionAbstract;
  const hasFunding = extras?.rawFunding?.some((f) => f.funderName?.trim());

  if (!hasRorAffiliation && !hasAbstract && !hasFunding) {
    console.log(
      "[Zenodo] No ROR affiliations, abstract, or funding to patch - skipping InvenioRDM patch",
    );

    return;
  }

  try {
    console.log(
      `[Zenodo] RDM affiliation patch: reading current draft for deposition ${depositionId}`,
    );

    const getResponse = await fetch(
      `${config.zenodoApiEndpoint}/records/${depositionId}/draft`,
      { headers: { Authorization: `Bearer ${zenodoToken}` } },
    );

    if (!getResponse.ok) {
      const body = await getResponse.text().catch(() => "");
      console.error(
        `[Zenodo] RDM affiliation patch: failed to read draft (status: ${getResponse.status}) - ${body}`,
      );

      return;
    }

    const legacyDraft = await getResponse.json();
    console.log(
      `[Zenodo] RDM affiliation patch: legacy draft creators received: ${JSON.stringify(legacyDraft.metadata?.creators, null, 2)}`,
    );

    const payload = convertLegacyDraftToRdmPayload(
      legacyDraft,
      creators,
      posterLicense,
      { ...extras },
    );
    console.log(
      `[Zenodo] RDM affiliation patch: sending InvenioRDM payload: ${JSON.stringify(payload, null, 2)}`,
    );

    const putDraft = async (body: object) => {
      const res = await fetch(
        `${config.zenodoApiEndpoint}/records/${depositionId}/draft`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${zenodoToken}`,
          },
          body: JSON.stringify(body),
        },
      );
      const text = await res.text().catch(() => "");

      return { ok: res.ok, status: res.status, body: text };
    };

    let put = await putDraft(payload);

    // Zenodo's vocabulary doesn't include every ROR/funder ID. Detect the
    // rejection via structured errors[] first; fall back to substring match
    // if the body isn't valid JSON or has no errors array.
    const isVocabularyRejection = (res: {
      ok: boolean;
      status: number;
      body: string;
    }) => {
      if (res.ok || res.status !== 400) return false;
      try {
        const parsed = JSON.parse(res.body) as {
          errors?: { message?: string }[];
        };
        if (parsed.errors?.length) {
          return parsed.errors.some((e) =>
            /invalid value/i.test(e.message ?? ""),
          );
        }
      } catch {
        // not JSON - fall through to substring check
      }

      return /invalid value/i.test(res.body);
    };

    if (isVocabularyRejection(put)) {
      console.warn(
        `[Zenodo] RDM affiliation patch: ROR/funder vocabulary rejection (status: ${put.status}) - ${put.body}. Retrying without ROR IDs.`,
      );

      const fallback = convertLegacyDraftToRdmPayload(
        legacyDraft,
        creators,
        posterLicense,
        { ...extras, skipRorIds: true, skipFunderIds: true },
      );
      console.log(
        `[Zenodo] RDM affiliation patch: retry payload (name-only affiliations/funders): ${JSON.stringify(fallback, null, 2)}`,
      );

      put = await putDraft(fallback);
    }

    if (!put.ok) {
      console.error(
        `[Zenodo] RDM affiliation patch: PUT failed (status: ${put.status}) - ${put.body}`,
      );

      return;
    }

    console.log(
      `[Zenodo] RDM affiliation patch: success for deposition ${depositionId}`,
    );
    console.log(`[Zenodo] RDM affiliation patch: response: ${put.body}`);
  } catch (err) {
    console.error(
      "[Zenodo] RDM affiliation patch: unexpected error (publication continues):",
      err,
    );
  }
}

async function createNewVersionDeposition(
  zenodoToken: string,
  depositionId: number,
) {
  console.log(`[Zenodo] Creating new version for deposition: ${depositionId}`);

  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/deposit/depositions/${depositionId}/actions/newversion`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${zenodoToken}`,
        },
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      console.log(
        `[Zenodo] New version creation failed (status: ${response.status}) - ${body}`,
      );

      return {
        success: false,
        error: `Failed to create new version: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      };
    }

    const data = await response.json();

    console.log(
      `[Zenodo] New version created (id: ${data.id}) for deposition: ${depositionId}`,
    );

    return { success: true, data };
  } catch (error) {
    console.log("[Zenodo] Error creating new version:", error);

    return {
      success: false,
      error: `Failed to create new version: ${(error as Error).message}`,
    };
  }
}

async function getWorkingDeposition(
  mode: string,
  depositionId: number,
  zenodoToken: string,
) {
  console.log(`[Zenodo] Getting working deposition (mode: ${mode})`);

  if (mode === "new") {
    // Create a new deposition on Zenodo
    const newDeposition = await createZenodoDeposition(zenodoToken);

    if (!newDeposition.success) {
      return { success: false, error: newDeposition.error };
    }

    return { success: true, data: newDeposition.data };
  } else {
    // Use existing deposition (Creating new version)
    console.log(`[Zenodo] Fetching existing deposition: ${depositionId}`);

    const existingDeposition = await getZenodoDeposition(
      depositionId!,
      zenodoToken,
    );

    if (!existingDeposition.success) {
      return { success: false, error: existingDeposition.error };
    }

    // If the deposition is stilla draft, delete its files
    if (existingDeposition.data.submitted === false) {
      console.log(
        `[Zenodo] Deposition ${depositionId} is a draft, deleting ${existingDeposition.data.files.length} existing files`,
      );

      for (const file of existingDeposition.data.files) {
        const status = await deleteFileFromZenodo(
          depositionId!,
          zenodoToken,
          file.filename,
        );

        if (!status.success) {
          return { success: false, error: status.error };
        }
      }

      return { success: true, data: existingDeposition.data };
    }

    // If the deposition is submitted, create a new version
    console.log(
      `[Zenodo] Deposition ${depositionId} is submitted, creating new version`,
    );

    const newZenodoVersion = await createNewVersionDeposition(
      zenodoToken,
      depositionId!,
    );

    if (!newZenodoVersion.success) {
      return { success: false, error: newZenodoVersion.error };
    }

    // Delete any files from the new version draft if present
    if (newZenodoVersion.data.files && newZenodoVersion.data.files.length > 0) {
      console.log(
        `[Zenodo] Deleting ${newZenodoVersion.data.files.length} files from new version draft`,
      );

      for (const file of newZenodoVersion.data.files) {
        const status = await deleteFileFromZenodo(
          newZenodoVersion.data.id,
          zenodoToken,
          file.filename,
        );

        if (!status.success) {
          return { success: false, error: status.error };
        }
      }
    }

    return { success: true, data: newZenodoVersion.data };
  }
}

async function uploadFileToZenodoBucket(
  bucketUrl: string,
  zenodoToken: string,
  filename: string,
  content: Blob,
) {
  console.log(`[Zenodo] Uploading file "${filename}" to bucket: ${bucketUrl}`);

  try {
    const response = await fetch(`${bucketUrl}/${filename}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(content.size),
        Authorization: `Bearer ${zenodoToken}`,
      },
      body: content,
    });

    if (!response.ok) {
      console.log(
        `[Zenodo] Failed to upload file "${filename}" (status: ${response.status})`,
      );

      const errorMsg = await getZenodoErrorMessage(
        `Failed to upload file "${filename}"`,
        response,
      );

      console.log(`[Zenodo] ${errorMsg}`);

      return { success: false, error: errorMsg };
    }

    const data = await response.json();

    console.log(`[Zenodo] Uploaded file "${filename}" successfully`);

    return { success: true, data };
  } catch (error) {
    console.log(`[Zenodo] Error uploading file "${filename}":`, error);

    return {
      success: false,
      error: `Failed to upload file "${filename}": ${(error as Error).message}`,
    };
  }
}

async function publishZenodoDeposition(
  zenodoToken: string,
  depositionId: number,
) {
  console.log(`[Zenodo] Publishing deposition: ${depositionId}`);

  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/deposit/depositions/${depositionId}/actions/publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${zenodoToken}`,
        },
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      console.log(
        `[Zenodo] Publish failed (status: ${response.status}) - ${body}`,
      );

      return {
        success: false,
        error: `Failed to publish deposition: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      };
    }

    const data = await response.json();

    console.log(
      `[Zenodo] Deposition ${depositionId} published at: ${data.links?.latest_html}`,
    );
    console.log(
      `[Zenodo] Published record URL: ${data.links?.record_html ?? data.links?.latest_html}`,
    );

    return { success: true, data };
  } catch (error) {
    console.log("[Zenodo] Error publishing deposition:", error);

    return {
      success: false,
      error: `Failed to publish deposition: ${(error as Error).message}`,
    };
  }
}
