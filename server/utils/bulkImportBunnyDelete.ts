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
