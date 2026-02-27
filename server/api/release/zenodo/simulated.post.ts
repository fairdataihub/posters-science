import { z } from "zod";

const payloadSchema = z.object({
  posterId: z.string(),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { user } = session;

  const body = await readBody(event);
  const { posterId } = payloadSchema.parse(body);
  const posterIdInt = Number.parseInt(posterId, 10);

  if (Number.isNaN(posterIdInt)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid poster ID",
    });
  }

  const poster = await prisma.poster.findFirst({
    where: {
      id: posterIdInt,
      userId: user.id,
    },
    select: {
      id: true,
    },
  });

  if (!poster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  await prisma.poster.update({
    where: {
      id: poster.id,
    },
    data: {
      status: "published",
      publishedAt: new Date(),
      posterMetadata: {
        update: {
          publisher: "Zenodo",
          publicationYear: new Date().getFullYear(),
        },
      },
    },
  });

  return {
    success: true,
    message: "Poster marked as published (simulated)",
  };
});
