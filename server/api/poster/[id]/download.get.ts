import archiver from "archiver";
import { Readable } from "node:stream";
import { sendStream, setHeader } from "h3";
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

  const fileUrl = `${bunnyPrivateStorage}/${extractionJob.filePath}`;
  const fileResponse = await fetch(fileUrl, {
    headers: {
      AccessKey: bunnyPrivateStorageKey,
      "Content-Type": "application/octet-stream",
    },
  });

  if (!fileResponse.ok || !fileResponse.body) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch file from storage",
    });
  }

  // Build poster.json
  const meta = poster.posterMetadata;
  const posterJson = meta
    ? buildPosterJson(meta, {
        title: poster.title,
        description: poster.description,
      })
    : { title: poster.title, description: poster.description };
  const posterJsonBuffer = Buffer.from(
    JSON.stringify(posterJson, null, 2),
    "utf-8",
  );

  // PDFs are already compressed - level 1 avoids wasting CPU for no size gain
  const archive = archiver("zip", { zlib: { level: 1 } });

  archive.append(posterJsonBuffer, { name: "poster.json" });

  const nodeStream = Readable.fromWeb(
    fileResponse.body as Parameters<typeof Readable.fromWeb>[0],
  );
  const zipEntryName = extractionJob.fileName || "poster.pdf";
  archive.append(nodeStream, { name: zipEntryName });

  // Mark as published before streaming begins
  await prisma.poster.update({
    where: { id: posterId },
    data: { status: "published", publishedAt: new Date() },
  });

  const zipFilename = "poster-package.zip";

  setHeader(event, "Content-Type", "application/zip");
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename="${zipFilename}"`,
  );

  // Convert to web stream before finalize so bytes flow to the client as they
  // arrive from Bunny - no waiting for the full zip to buffer in memory first
  const webStream = Readable.toWeb(
    archive as unknown as Readable,
  ) as ReadableStream;

  archive.finalize();

  return sendStream(event, webStream);
});
