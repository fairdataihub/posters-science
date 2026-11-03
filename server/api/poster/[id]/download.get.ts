import archiver from "archiver";
import { Readable } from "node:stream";
import { sendStream, setHeader } from "h3";
import {
  appendPosterDownloadPackage,
  uniquePosterFolderName,
} from "../../../utils/posterDownloadPackage";
import { posterManagedByUnfinishedBulkBatch } from "~~/server/utils/bulkImportDashboard";

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
  const userId = user.id;

  const poster = await prisma.poster.findUnique({
    where: {
      id: posterId,
      userId,
    },
    include: {
      posterMetadata: true,
      extractionJob: {
        select: {
          fileName: true,
          filePath: true,
        },
      },
    },
  });

  if (!poster) {
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  const config = useRuntimeConfig();
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;

  if (!bunnyPrivateStorage || !bunnyPrivateStorageKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "Storage not configured",
    });
  }

  const { extractionJob } = poster;
  if (!extractionJob?.filePath) {
    throw createError({
      statusCode: 500,
      statusMessage: "No extraction file found",
    });
  }

  // PDFs are already compressed - level 1 avoids wasting CPU for no size gain
  const archive = archiver("zip", { zlib: { level: 1 } });

  try {
    await appendPosterDownloadPackage(archive, poster, {
      bunnyPrivateStorage,
      bunnyPrivateStorageKey,
    });
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch file from storage",
    });
  }

  // Mark as downloaded for single-poster local export. Bulk batch posters stay
  // draft until Zenodo publish so the batch card remains on the dashboard.
  const managedByBulk = await posterManagedByUnfinishedBulkBatch(
    userId,
    posterId,
  );
  if (!managedByBulk) {
    await prisma.poster.update({
      where: { id: posterId },
      data: { status: "downloaded" },
    });
  }

  // Same name the batch download uses for this poster's folder: the uploaded
  // file name without its extension (else poster-<id>).
  const baseName = uniquePosterFolderName(
    extractionJob.fileName ?? "",
    posterId,
    new Set(),
  );
  const zipFilename = `${baseName}.zip`;
  // ASCII fallback for old clients + RFC 5987 UTF-8 name for the rest.
  const asciiFilename = zipFilename.replace(/[^\x20-\x7e]/g, "_");

  setHeader(event, "Content-Type", "application/zip");
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
  );

  // Convert to web stream before finalize so bytes flow to the client as they
  // arrive from Bunny - no waiting for the full zip to buffer in memory first
  const webStream = Readable.toWeb(
    archive as unknown as Readable,
  ) as ReadableStream;

  archive.finalize();

  return sendStream(event, webStream);
});
