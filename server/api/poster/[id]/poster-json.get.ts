import {
  buildPosterJson,
  fillMissingMandatoryFields,
} from "../../../utils/buildPosterJson";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { id } = event.context.params as { id: string };

  // Opt-in: fill the empty mandatory fields with placeholders and return the file as a
  // download. Used by the staging auto-download flow
  const fillMissing = getQuery(event).fillMissing === "1";

  const posterId = parseInt(id);
  if (isNaN(posterId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid poster ID",
    });
  }

  const { user } = session;

  const poster = await prisma.poster.findUnique({
    where: {
      id: posterId,
      userId: user.id,
    },
    include: {
      posterMetadata: true,
    },
  });

  if (!poster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  const meta = poster.posterMetadata;

  let posterJson: Record<string, unknown> = meta
    ? buildPosterJson(meta, {
        title: poster.title,
        description: poster.description,
      })
    : {
        ...(poster.title && { titles: [{ title: poster.title }] }),
        ...(poster.description && {
          descriptions: [
            { description: poster.description, descriptionType: "Other" },
          ],
        }),
      };

  if (fillMissing) {
    posterJson = fillMissingMandatoryFields(posterJson);

    setHeader(event, "Content-Type", "application/json");
    setHeader(event, "Content-Disposition", "attachment; filename=poster.json");
  }

  return posterJson;
});
