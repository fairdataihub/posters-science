import archiver from "archiver";
import { Readable } from "node:stream";
import { sendStream, setHeader } from "h3";
import { buildPosterJson } from "../../../utils/buildPosterJson";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const { id } = event.context.params as { id: string };

  const posterId = parseInt(id);
  if (isNaN(posterId)) {
    console.warn("[download] Invalid poster ID:", id);
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid poster ID",
    });
  }

  const { user } = session;
  const userId = user.id;
  console.log("[download] Request for poster", posterId, "by user", userId);

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
    console.warn("[download] Poster not found:", posterId, "user:", userId);
    throw createError({
      statusCode: 404,
      statusMessage: "Poster not found",
    });
  }

  const config = useRuntimeConfig();
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;

  if (!bunnyPrivateStorage || !bunnyPrivateStorageKey) {
    console.error(
      "[download] Storage not configured (bunnyPrivateStorage/bunnyPrivateStorageKey)",
    );
    throw createError({
      statusCode: 503,
      statusMessage: "Storage not configured",
    });
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  console.log("[download] Building zip for poster", posterId);

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
  console.log("[download] Added poster.json to archive");

  // If we have a file in Bunny, fetch it and add to the zip
  const { extractionJob } = poster;
  if (extractionJob?.filePath) {
    console.log(
      "[download] Fetching file from storage:",
      extractionJob.fileName ?? extractionJob.filePath,
    );
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
      console.log("[download] Added file to archive:", zipEntryName);
    } else {
      console.warn(
        "[download] Failed to fetch file from storage, status:",
        fileResponse.status,
      );
    }
  } else {
    console.log("[download] No extraction file, zip contains poster.json only");
  }

  await archive.finalize();

  const zipFilename = "poster-package.zip";

  setHeader(event, "Content-Type", "application/zip");
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename="${zipFilename}"`,
  );

  console.log("[download] Streaming zip:", zipFilename);
  const webStream = Readable.toWeb(
    archive as unknown as Readable,
  ) as ReadableStream;

  return sendStream(event, webStream);
});
