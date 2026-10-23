import { discardZenodoDraft } from "~~/server/utils/zenodo";

/**
 * Hard-deletes an unpublished draft poster owned by the user (DB + poster storage).
 * Used by single-poster delete and bulk import cleanup.
 */
export async function deleteUserDraftPoster(
  userId: string,
  posterId: number,
): Promise<{ deleted: boolean; reason?: string }> {
  const poster = await prisma.poster.findUnique({
    where: { id: posterId, userId },
    select: {
      id: true,
      status: true,
      versionRootId: true,
      extractionJob: {
        select: { filePath: true, status: true, completed: true },
      },
      zenodoDepositions: {
        select: { depositionId: true, status: true },
      },
    },
  });

  if (!poster) {
    return { deleted: false, reason: "not_found" };
  }

  if (poster.status === "published") {
    return { deleted: false, reason: "published" };
  }

  const versionDraftReady =
    !poster.extractionJob ||
    poster.extractionJob.completed ||
    poster.extractionJob.status === "completed" ||
    poster.extractionJob.status === "failed";

  if (poster.versionRootId !== null && !versionDraftReady) {
    return { deleted: false, reason: "version_extraction_active" };
  }

  if (poster.zenodoDepositions?.status === "published") {
    return { deleted: false, reason: "zenodo_published" };
  }

  if (
    poster.zenodoDepositions?.status === "draft" ||
    poster.zenodoDepositions?.status === "draft-new"
  ) {
    const discarded = await discardZenodoDraft(
      userId,
      poster.zenodoDepositions.depositionId,
    );

    if (!discarded.success) {
      throw createError({
        statusCode: 502,
        statusMessage: discarded.error,
      });
    }
  }

  const filePath = poster.extractionJob?.filePath;

  await prisma.poster.delete({ where: { id: posterId } });

  const config = useRuntimeConfig();
  if (filePath && config.bunnyPrivateStorage && config.bunnyPrivateStorageKey) {
    const folderPath = filePath.substring(0, filePath.lastIndexOf("/") + 1);
    const res = await fetch(`${config.bunnyPrivateStorage}/${folderPath}`, {
      method: "DELETE",
      headers: { AccessKey: config.bunnyPrivateStorageKey },
    });
    if (!res.ok) {
      console.error(
        `[poster/delete] Bunny delete failed for ${folderPath}: ${res.status}`,
      );
    }
  }

  return { deleted: true };
}
