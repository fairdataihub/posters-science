import { buildPosterJson } from "../../../utils/buildPosterJson";

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

  return meta
    ? buildPosterJson(meta, {
        title: poster.title,
        description: poster.description,
      })
    : { title: poster.title, description: poster.description };
});
