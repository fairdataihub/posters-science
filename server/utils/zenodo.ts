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

export async function beginZenodoPublication(
  posterId: string,
  mode: string,
  existingDepositionId: number | undefined,
  userId: string,
  onProgress?: ProgressCallback,
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
  const addUploadType = !!deposition?.metadata?.upload_type;
  const newDepositionId = deposition.record_id;
  const bucketUrl = deposition.links.bucket;
  const doi = deposition.metadata.prereserve_doi.doi;

  console.log(
    `[Zenodo] Working deposition ready - id: ${newDepositionId}, doi: ${doi}, bucket: ${bucketUrl}`,
  );

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
  const creators = poster.posterMetadata.creators as {
    name: string;
    affiliation?: { name: string }[];
  }[];

  // TODO: Add more metadata fields as needed
  const metadata = {
    metadata: {
      title: poster.title,
      upload_type: "poster",
      publication_type: "poster",
      creators: creators.map((c) => ({
        name: c.name,
        ...(c.affiliation?.[0]?.name && {
          affiliation: c.affiliation[0].name,
        }),
      })),
      description: poster.description,
      prereserve_doi: {
        doi,
      },
    },
  };

  // Update the zenodo deposition metadata
  console.log(`[Zenodo] Updating metadata for deposition: ${newDepositionId}`);

  await updateDepositionMetadata(
    newDepositionId,
    tokenRecord.accessToken,
    metadata,
  );

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

  const posterJson = buildPosterJson(poster.posterMetadata);
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

  // TODO: Retrieve and upload poster file

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
  console.log(`[Zenodo] Publishing deposition: ${newDepositionId}`);

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

    // if the metadata does not have an upload_type, add it and update the metadata again
    console.log("[Zenodo] Checking for upload_type in metadata");
    if (
      !updatedData?.metadata?.upload_type ||
      updatedData?.metadata?.upload_type != "poster"
    ) {
      console.log(
        "[Zenodo] upload_type present, re-updating metadata with poster type",
      );

      console.log("[Zenodo] Current metadata:", updatedData.metadata);

      const newMetadata = {
        ...updatedData.metadata,
        upload_type: "poster",
      };

      console.log("[Zenodo] New metadata:", newMetadata);

      await updateDepositionMetadata(depositionId, zenodoToken, {
        metadata: newMetadata,
      });
    }

    return { success: true, data: updatedData };
  } catch (error) {
    console.log("[Zenodo] Error updating metadata:", error);

    return {
      success: false,
      error: `Failed to update metadata: ${(error as Error).message}`,
    };
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

    return { success: true, data };
  } catch (error) {
    console.log("[Zenodo] Error publishing deposition:", error);

    return {
      success: false,
      error: `Failed to publish deposition: ${(error as Error).message}`,
    };
  }
}
