import { deleteUserDraftPoster } from "~~/server/utils/deleteUserDraftPoster";

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

  const result = await deleteUserDraftPoster(user.id, posterId);

  if (result.reason === "not_found") {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  if (result.reason === "published") {
    throw createError({
      statusCode: 400,
      statusMessage: "Published posters cannot be deleted",
    });
  }

  if (result.reason === "version_extraction_active") {
    throw createError({
      statusCode: 409,
      statusMessage:
        "Version drafts cannot be deleted while metadata extraction is still running",
    });
  }

  if (result.reason === "zenodo_published") {
    throw createError({
      statusCode: 409,
      statusMessage:
        "This version has already been published to Zenodo and cannot be deleted as a draft",
    });
  }

  if (!result.deleted) {
    throw createError({
      statusCode: 400,
      statusMessage: "Poster could not be deleted",
    });
  }

  return { success: true };
});
