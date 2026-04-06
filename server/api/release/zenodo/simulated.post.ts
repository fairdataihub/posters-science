import { z } from "zod";

const payloadSchema = z.object({
  posterId: z.string(),
  license: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { user } = session;

  const body = await readBody(event);
  const { posterId, license } = payloadSchema.parse(body);
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

  const now = new Date();

  await prisma.poster.update({
    where: {
      id: poster.id,
    },
    data: {
      status: "published",
      publishedAt: now,
      posterMetadata: {
        update: {
          publisher: "Zenodo",
          publicationYear: now.getFullYear(),
          ...(license ? { license } : {}),
        },
      },
    },
  });

  return {
    success: true,
    message: "Poster marked as published (simulated)",
  };
});
