/** Deletes all objects under a bulk import job prefix (posters, license file, etc.). */
export async function deleteBunnyBulkImportJobFolder(input: {
  bunnyPrivateStorage: string;
  bunnyPrivateStorageKey: string;
  jobPrefix: string;
}) {
  const folderPath = input.jobPrefix.endsWith("/")
    ? input.jobPrefix
    : `${input.jobPrefix}/`;

  const response = await fetch(`${input.bunnyPrivateStorage}/${folderPath}`, {
    method: "DELETE",
    headers: { AccessKey: input.bunnyPrivateStorageKey },
  });

  if (response.status === 404) {
    // No objects uploaded yet (e.g. name-only draft) or folder already removed.
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(
      "[bulk/bunny-delete] Bunny job folder delete failed:",
      response.status,
      text,
    );
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to delete bulk import files from storage",
    });
  }
}

export async function deleteBunnyPosterObjectFolder(input: {
  bunnyPrivateStorage: string;
  bunnyPrivateStorageKey: string;
  filePath: string;
}) {
  const folderPath = input.filePath.substring(
    0,
    input.filePath.lastIndexOf("/") + 1,
  );

  const response = await fetch(`${input.bunnyPrivateStorage}/${folderPath}`, {
    method: "DELETE",
    headers: { AccessKey: input.bunnyPrivateStorageKey },
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(
      "[bulk/bunny-delete] Bunny delete failed:",
      response.status,
      text,
    );
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to delete file from storage",
    });
  }
}
