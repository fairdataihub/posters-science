import { z } from "zod";

const payloadSchema = z.object({
  doi: z.string().optional(),
  license: z.string().optional(),
  publisher: z.string().optional(),
  publicationYear: z.number().optional(),
});

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
    select: { id: true, status: true },
  });

  if (!poster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  const body = await readValidatedBody(event, payloadSchema.parse);

  const updateData: Record<string, unknown> = {};
  if (body.doi !== undefined) updateData.doi = body.doi;
  if (body.license !== undefined) updateData.license = body.license;
  if (body.publisher !== undefined) updateData.publisher = body.publisher;
  if (body.publicationYear !== undefined)
    updateData.publicationYear = body.publicationYear;

  await prisma.posterMetadata.update({
    where: { posterId },
    data: updateData,
  });

  if (poster.status === "downloaded") {
    await prisma.poster.update({
      where: { id: posterId },
      data: { status: "published", publishedAt: new Date() },
    });
  }

  return { success: true };
});
