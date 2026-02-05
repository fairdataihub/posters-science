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

  const archive = archiver("zip", { zlib: { level: 9 } });

  // Add poster.json (metadata) to the zip
  const meta = poster.posterMetadata;
  const posterJson = meta
    ? buildPosterJson(meta)
    : { title: poster.title, description: poster.description };
  const posterJsonBuffer = Buffer.from(
    JSON.stringify(posterJson, null, 2),
    "utf-8",
  );
  archive.append(posterJsonBuffer, { name: "poster.json" });

  // If we have a file in Bunny, fetch it and add to the zip
  const { extractionJob } = poster;
  if (extractionJob?.filePath) {
    const fileUrl = `${bunnyPrivateStorage}/${extractionJob.filePath}`;
    const fileResponse = await fetch(fileUrl, {
      headers: {
        AccessKey: bunnyPrivateStorageKey,
        "Content-Type": "application/octet-stream",
      },
    });

    if (fileResponse.ok && fileResponse.body) {
      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
      const zipEntryName = extractionJob.fileName || "poster.pdf";
      archive.append(fileBuffer, { name: zipEntryName });
    } else {
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to fetch file from storage",
      });
    }
  } else {
    throw createError({
      statusCode: 500,
      statusMessage: "No extraction file found",
    });
  }

  await archive.finalize();

  const zipFilename = "poster-package.zip";

  setHeader(event, "Content-Type", "application/zip");
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename="${zipFilename}"`,
  );

  const webStream = Readable.toWeb(
    archive as unknown as Readable,
  ) as ReadableStream;

  return sendStream(event, webStream);
});
