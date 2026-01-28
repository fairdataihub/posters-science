const config = useRuntimeConfig();

async function getZenodoToken(userId: string) {
  const tokenRecord = await prisma.zenodoToken.findUnique({
    where: {
      userId,
    },
  });

  if (!tokenRecord) {
    return null;
  }

  return tokenRecord;
}

export async function validateZenodoToken(userId: string) {
  let message = "";
  let zenodoToken = false;
  const existingDepositions = [];
  const tokenRecord = await getZenodoToken(userId);

  if (tokenRecord) {
    // Token exists, ensure is still valid
    const zenodoTokenInfo = await fetch(
      `${config.zenodoApiEndpoint}/api/deposit/depositions?access_token=${tokenRecord.accessToken}`,
    );

    if (!zenodoTokenInfo.ok) {
      // Token invalid or expired
      message = "Zenodo token is invalid or expired";
      await prisma.zenodoToken.delete({
        where: {
          userId,
        },
      });
    } else {
      // Token valid - refresh it to extend the session
      await refreshZenodoToken(userId, tokenRecord.refreshToken);

      zenodoToken = true;
      message = "Zenodo token is valid";

      const responseData = await zenodoTokenInfo.json();

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
    message = "No Zenodo token found";
  }

  return { zenodoToken, message, existingDepositions };
}

async function refreshZenodoToken(userId: string, refreshToken: string) {
  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.zenodoClientId,
    client_secret: config.zenodoClientSecret,
  });

  const refresh = await fetch(`${config.zenodoApiEndpoint}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: refreshBody.toString(),
  });

  if (refresh.ok) {
    const { access_token, refresh_token, expires_in } = await refresh.json();
    await prisma.zenodoToken.update({
      where: { userId },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      },
    });
  }
}

export async function beginZenodoPublication(
  posterId: string,
  mode: string,
  existingDepositionId: number | undefined,
  userId: string,
) {
  // Implementation of publishing to Zenodo

  if (mode === "existing" && !existingDepositionId) {
    return {
      success: false,
      error: "Existing deposition ID is required for 'existing' mode",
    };
  }

  // Get the user's Zenodo token
  const tokenRecord = await getZenodoToken(userId);
  if (!tokenRecord) {
    return { success: false, error: "Zenodo token not found for user" };
  }

  const status = await getWorkingDeposition(
    mode,
    existingDepositionId!,
    tokenRecord.accessToken,
  );

  if (!status.success) {
    return { success: false, error: status.error };
  }

  const deposition = status.data;

  // Set the bucket url and doi (using record_id over id because it is the id of the current deposition)
  const addUploadType = !!deposition?.metadata?.upload_type;
  const newDepositionId = deposition.record_id;
  const bucketUrl = deposition.links.bucket;
  const doi = deposition.metadata.prereserve_doi.doi;

  // TODO: Update citation.cff and codemeta.json files?

  // TODO: Gather metadata for Zenodo deposition
  const metadata = {
    metadata: {
      title: `Poster #${posterId} Publication`,
      upload_type: "poster",
      publication_type: "poster",
      creators: [
        {
          name: "Doe, John",
        },
      ],
      description: "Poster publication uploaded from Posters.Science",
      prereserve_doi: {
        doi,
      },
    },
  };
  // Update the zenodo deposition metadata
  await updateDepositionMetadata(
    newDepositionId,
    tokenRecord.accessToken,
    metadata,
  );

  // TODO: Gather, create files that will be uploaded to Zenodo

  // TODO: Upload files to Zenodo deposition bucket

  // Publish the deposition
  const publishResult = await publishZenodoDeposition(
    tokenRecord.accessToken,
    newDepositionId,
  );

  if (!publishResult.success) {
    return { success: false, error: publishResult.error };
  }

  return { success: true, data: publishResult.data };
}

async function createZenodoDeposition(zenodoToken: string) {
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

    return { success: true, data: await response.json() };
  } catch (error) {
    return { success: false, error };
  }
}

async function getZenodoDeposition(depositionId: number, zenodoToken: string) {
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
        return {
          success: false,
          error: `Deposition with ID ${depositionId} not found`,
        };
      }

      return { success: true, data: await draftResponse.json() };
    }

    return { success: true, data: await response.json() };
  } catch (error) {
    return { success: false, error };
  }
}

async function deleteFileFromZenodo(
  depositionId: number,
  zenodoToken: string,
  filename: string,
) {
  // Delete a file from a Zenodo deposition
  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${depositionId}/draft/files/${filename}?access_token=${zenodoToken}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      return { success: false, error: response };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

async function updateDepositionMetadata(
  depositionId: number,
  zenodoToken: string,
  metadata: object,
) {
  // Update the metadata of a Zenodo deposition
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
      return { success: false, error: response };
    }

    const updatedData = await response.json();

    // if the metadata does not have an upload_type, add it and update the metadata again
    if (updatedData?.metadata?.upload_type) {
      const newMetadata = {
        ...updatedData.metadata,
        upload_type: "poster",
      };

      await updateDepositionMetadata(depositionId, zenodoToken, {
        metadata: newMetadata,
      });
    }

    return { success: true, data: updatedData };
  } catch (error) {
    return { success: false, error };
  }
}

async function createNewVersionDeposition(
  zenodoToken: string,
  depositionId: number,
) {
  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${depositionId}/actions/newversion`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${zenodoToken}`,
        },
      },
    );

    if (!response.ok) {
      return { success: false, error: response };
    }

    return { success: true, data: await response.json() };
  } catch (error) {
    return { success: false, error };
  }
}

async function getWorkingDeposition(
  mode: string,
  depositionId: number,
  zenodoToken: string,
) {
  if (mode === "new") {
    // Create a new deposition on Zenodo
    const newDeposition = await createZenodoDeposition(zenodoToken);
    if (!newDeposition.success) {
      return { success: false, error: newDeposition.error };
    }

    return { success: true, data: newDeposition.data };
  } else {
    // Use existing deposition (Creating new version)
    const existingDeposition = await getZenodoDeposition(
      depositionId!,
      zenodoToken,
    );

    if (!existingDeposition.success) {
      return { success: false, error: existingDeposition.error };
    }

    // If the deposition is stilla draft, delete its files
    if (existingDeposition.data.submitted === false) {
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
    const newZenodoVersion = await createNewVersionDeposition(
      zenodoToken,
      depositionId!,
    );

    if (!newZenodoVersion.success) {
      return { success: false, error: newZenodoVersion.error };
    }

    // Delete any files from the new version draft if present
    if (newZenodoVersion.data.files && newZenodoVersion.data.files.length > 0) {
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

async function publishZenodoDeposition(
  zenodoToken: string,
  depositionId: number,
) {
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
      return { success: false, error: response };
    }

    return { success: true, data: await response.json() };
    // Deposition published at: responseData.links.latest_html
  } catch (error) {
    return { success: false, error };
  }
}
