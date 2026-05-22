import { buildPosterJson } from "./buildPosterJson";
import isoLanguages from "../../app/assets/data/iso-639-1.json";

const ISO639_1_TO_3: Record<string, string> = Object.fromEntries(
  isoLanguages.filter((l) => l.alpha3).map((l) => [l.code, l.alpha3]),
);
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

  const rawRelated = meta.relatedIdentifiers as {
    relatedIdentifier?: string;
    relatedIdentifierType?: string;
    relationType?: string;
    resourceTypeGeneral?: string;
  }[];

  const rawFunding = meta.fundingReferences as {
    funderName?: string;
    funderIdentifier?: string;
    funderIdentifierType?: string;
    awardNumber?: string;
    awardTitle?: string;
  }[];

  const datesArr = Array.isArray(meta.dates)
    ? (meta.dates as Array<{ date?: string; dateType?: string }>)
    : [];

  const hasSubmittedInMeta = datesArr.some((d) => d.dateType === "Submitted");

  const zenodoDates: {
    date: string;
    type: { id: string };
    description?: string;
  }[] = [];

  const zenodoSharedAt = new Date();

  // Inject submitted date from when the poster is shared to Zenodo
  if (!hasSubmittedInMeta) {
    zenodoDates.push({
      date: zenodoSharedAt.toISOString().slice(0, 10),
      type: { id: "submitted" },
      description: "Submitted to Zenodo through posters.science",
    });
  }

  // Map all meta.dates to InvenioRDM format. DataCite dateType values map
  // 1:1 to InvenioRDM type.id by lowercasing. "Presented" is our custom type
  // stored in meta.dates; it maps to type "other" with a description.
  for (const entry of datesArr) {
    if (!entry.date || !entry.dateType) continue;
    if (entry.dateType === "Presented") {
      zenodoDates.push({
        date: entry.date,
        type: { id: "other" },
        description: "Presented",
      });
    } else {
      zenodoDates.push({
        date: entry.date,
        type: { id: entry.dateType.toLowerCase() },
      });
    }
  }

  const posterContentObj = meta.posterContent as {
    submissionAbstract?: string;
  } | null;

  console.log(
    `[Zenodo] Updating metadata via InvenioRDM for deposition: ${newDepositionId}`,
  );

  const metadataResult = await updateRdmMetadata(
    newDepositionId,
    tokenRecord.accessToken,
    poster.title,
    poster.description,
    meta as unknown as Record<string, unknown>,
    creators,
    {
      submissionAbstract: posterContentObj?.submissionAbstract,
      rawFunding,
      dbRelated: Array.isArray(rawRelated) ? rawRelated : [],
      presentedDates: zenodoDates,
    },
  );

  if (!metadataResult.success) {
    console.error(
      `[Zenodo] Metadata update failed for deposition ${newDepositionId}: ${metadataResult.error}`,
    );

    await onProgress?.({
      step: "upload_metadata",
      status: "error",
      message: `Metadata update failed: ${metadataResult.error}`,
    });

    return { success: false, error: metadataResult.error };
  }

  if (!meta.version) {
    meta.version = mode === "new" ? "1" : null;
  } else if (mode === "existing") {
    const prev = parseInt(meta.version as string, 10);
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
    publishedAt: zenodoSharedAt,
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
  presentedDates?: {
    date: string;
    type: { id: string };
    description?: string;
  }[];
};

// Builds a complete InvenioRDM PUT payload directly from DB data.
// Used instead of convertLegacyDraftToRdmPayload so we never need to GET the
// legacy draft before updating metadata.
function buildFullRdmPayload(
  posterTitle: string,
  posterDescription: string,
  meta: Record<string, unknown>,
  dbCreators: InvenioCreator[],
  options?: RdmExtras,
): object {
  const rdmCreators = buildRdmCreators(dbCreators, options);

  const keywords = ((meta.subjects as string[] | undefined) ?? []).filter(
    (s) => s !== "",
  );

  const lang2 = meta.language as string | null | undefined;
  const lang3 = lang2
    ? ((ISO639_1_TO_3 as Record<string, string>)[lang2] ?? lang2)
    : undefined;

  const licenseId = (meta.license as string | null | undefined)
    ? (meta.license as string).toLowerCase()
    : undefined;

  const rawRelated = (options?.dbRelated ?? []).filter(
    (r) => r.relatedIdentifier && r.relatedIdentifierType && r.relationType,
  );
  const rdmRelated = rawRelated
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

  const additionalDescriptions = options?.submissionAbstract
    ? [{ description: options.submissionAbstract, type: { id: "abstract" } }]
    : [];

  const conferenceDates =
    (meta.conferenceStartDate as string | null) &&
    (meta.conferenceEndDate as string | null)
      ? `${meta.conferenceStartDate} - ${meta.conferenceEndDate}`
      : (meta.conferenceStartDate as string | null) ||
        (meta.conferenceEndDate as string | null) ||
        (meta.conferenceYear ? String(meta.conferenceYear) : undefined);

  const meeting: Record<string, string> = {};
  if (meta.conferenceName) meeting.title = meta.conferenceName as string;
  if (meta.conferenceAcronym)
    meeting.acronym = meta.conferenceAcronym as string;
  if (meta.conferenceLocation)
    meeting.place = meta.conferenceLocation as string;
  if (meta.conferenceUri) meeting.url = meta.conferenceUri as string;
  if (conferenceDates) meeting.dates = conferenceDates;
  const customFields: Record<string, unknown> = {};
  if (Object.keys(meeting).length > 0) {
    customFields["meeting:meeting"] = meeting;
  }

  return {
    metadata: {
      title: posterTitle,
      description: posterDescription,
      publication_date: String(new Date().getFullYear()),
      resource_type: { id: "poster" },
      publisher: "Zenodo",
      creators: rdmCreators,
      ...(keywords.length > 0 && {
        subjects: keywords.map((kw) => ({ subject: kw })),
      }),
      ...(lang3 && { languages: [{ id: lang3 }] }),
      ...(licenseId && { rights: [{ id: licenseId }] }),
      ...(rdmRelated.length > 0 && { related_identifiers: rdmRelated }),
      ...(funding.length > 0 && { funding }),
      ...(additionalDescriptions.length > 0 && {
        additional_descriptions: additionalDescriptions,
      }),
      ...(options?.presentedDates?.length && {
        dates: options.presentedDates,
      }),
      ...((meta.version as string | null | undefined) && {
        version: meta.version as string,
      }),
    },
    ...(Object.keys(customFields).length > 0 && {
      custom_fields: customFields,
    }),
  };
}

// PUTs a complete InvenioRDM metadata payload for the given deposition.
// This is the sole metadata update path - replaces the legacy deposit API entirely.
async function updateRdmMetadata(
  depositionId: number,
  zenodoToken: string,
  posterTitle: string,
  posterDescription: string,
  meta: Record<string, unknown>,
  creators: InvenioCreator[],
  extras?: Pick<
    RdmExtras,
    "submissionAbstract" | "rawFunding" | "dbRelated" | "presentedDates"
  >,
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = buildFullRdmPayload(
      posterTitle,
      posterDescription,
      meta,
      creators,
      { ...extras },
    );
    console.log(
      `[Zenodo] RDM metadata: sending InvenioRDM payload for deposition ${depositionId}: ${JSON.stringify(payload, null, 2)}`,
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
        `[Zenodo] RDM metadata: ROR/funder vocabulary rejection (status: ${put.status}) - ${put.body}. Retrying without ROR/funder IDs.`,
      );

      const fallback = buildFullRdmPayload(
        posterTitle,
        posterDescription,
        meta,
        creators,
        { ...extras, skipRorIds: true, skipFunderIds: true },
      );
      console.log(
        `[Zenodo] RDM metadata: retry payload (name-only affiliations/funders): ${JSON.stringify(fallback, null, 2)}`,
      );

      put = await putDraft(fallback);
    }

    if (!put.ok) {
      const msg = `RDM metadata PUT failed (status: ${put.status}) - ${put.body}`;
      console.error(`[Zenodo] ${msg}`);

      return { success: false, error: msg };
    }

    console.log(
      `[Zenodo] RDM metadata: success for deposition ${depositionId}`,
    );

    return { success: true };
  } catch (err) {
    const msg = `RDM metadata: unexpected error - ${(err as Error).message}`;
    console.error(`[Zenodo] ${msg}`, err);

    return { success: false, error: msg };
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
