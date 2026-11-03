import { ensureThumbnailServicePosterPath } from "~~/server/utils/posterObjectPath";
import { wakeExtractionWorker } from "~~/server/utils/extraction";

export type QueueDraftPosterThumbnailResult =
  | { ok: true; queued: true; imageUrl: null }
  | { ok: true; queued: false; imageUrl: string }
  | { ok: false; statusCode: number; statusMessage: string };

/**
 * Unpublished posters: copy bulk-import paths if needed, re-queue thumbnail work,
 * and nudge the extraction worker. Published posters are handled synchronously in
 * the thumbnail POST route (public zone promotion).
 */
export async function queueDraftPosterThumbnail(
  posterId: number,
  userId: string,
): Promise<QueueDraftPosterThumbnailResult> {
  const poster = await prisma.poster.findUnique({
    where: { id: posterId, userId },
    select: {
      id: true,
      status: true,
      tombstone: true,
      extractionJob: {
        select: { id: true, filePath: true, fileUploaded: true },
      },
    },
  });

  if (!poster) {
    return {
      ok: false,
      statusCode: 404,
      statusMessage: "Poster not found",
    };
  }

  if (poster.tombstone) {
    return {
      ok: false,
      statusCode: 400,
      statusMessage: "Cannot generate thumbnail for a withdrawn poster",
    };
  }

  if (!poster.extractionJob?.filePath) {
    return {
      ok: false,
      statusCode: 400,
      statusMessage: "No file path available for this poster",
    };
  }

  if (!poster.extractionJob.fileUploaded) {
    return {
      ok: false,
      statusCode: 409,
      statusMessage: "Upload the original file before generating a preview",
    };
  }

  if (poster.status === "published") {
    return {
      ok: false,
      statusCode: 400,
      statusMessage: "Use the published thumbnail flow for published posters",
    };
  }

  const { id: extractionJobId, filePath: rawFilePath } = poster.extractionJob;

  const resolvedPath = await ensureThumbnailServicePosterPath(
    posterId,
    rawFilePath,
  );
  if (!resolvedPath.ok) {
    return {
      ok: false,
      statusCode: 400,
      statusMessage: resolvedPath.error,
    };
  }

  await prisma.extractionJob.update({
    where: { id: extractionJobId },
    data: {
      status: "pending-thumbnail",
      completed: false,
      error: null,
    },
  });

  wakeExtractionWorker(extractionJobId, "batch/upload");

  return { ok: true, queued: true, imageUrl: null };
}
