import { z } from "zod";

import {
  copyThumbnailToPublicZone,
  getOrCreateThumbnail,
} from "../../../utils/zenodo";

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
    select: {
      id: true,
      status: true,
      imageUrl: true,
      extractionJob: { select: { filePath: true } },
    },
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
  updateData.publisher = "Zenodo";
  if (body.publicationYear !== undefined)
    updateData.publicationYear = body.publicationYear;

  await prisma.posterMetadata.update({
    where: { posterId },
    data: updateData,
  });

  if (poster.status === "downloaded") {
    // Transfer the thumbnail to the public zone to ensure it is accessible to all users.
    const thumbnail = await getOrCreateThumbnail(
      posterId,
      poster.extractionJob?.filePath,
      poster.imageUrl,
    );

    if (!thumbnail.success) {
      throw createError({ statusCode: 502, statusMessage: thumbnail.error });
    }

    const published = await copyThumbnailToPublicZone(thumbnail.imageUrl);

    if (!published.success) {
      throw createError({ statusCode: 502, statusMessage: published.error });
    }

    await prisma.poster.update({
      where: { id: posterId },
      data: {
        status: "published",
        publishedAt: new Date(),
        imageUrl: published.imageUrl,
      },
    });
  }

  return { success: true };
});
