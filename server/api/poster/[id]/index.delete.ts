import { discardZenodoDraft } from "../../../utils/zenodo";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { id } = event.context.params as { id: string };

  const posterId = parseInt(id);
  if (isNaN(posterId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid poster ID",
    });
  }

  const { user } = session;

  const poster = await prisma.poster.findUnique({
    where: { id: posterId, userId: user.id },
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
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  if (poster.status === "published") {
    throw createError({
      statusCode: 400,
      statusMessage: "Published posters cannot be deleted",
    });
  }

  const versionDraftReady =
    !poster.extractionJob ||
    poster.extractionJob.completed ||
    poster.extractionJob.status === "completed" ||
    poster.extractionJob.status === "failed";

  if (poster.versionRootId !== null && !versionDraftReady) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "Version drafts cannot be deleted while metadata extraction is still running",
    });
  }

  if (poster.zenodoDepositions?.status === "published") {
    throw createError({
      statusCode: 409,
      statusMessage:
        "This version has already been published to Zenodo and cannot be deleted as a draft",
    });
  }

  if (
    poster.zenodoDepositions?.status === "draft" ||
    poster.zenodoDepositions?.status === "draft-new"
  ) {
    const discarded = await discardZenodoDraft(
      user.id,
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

  // Delete from DB
  await prisma.poster.delete({ where: { id: posterId } });

  const config = useRuntimeConfig();
  // Delete from Bunny if filepath exists
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

  return { success: true };
});
