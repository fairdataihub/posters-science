import { processExtraction } from "~~/server/utils/posterExtraction";

const config = useRuntimeConfig();

async function getFileFromBunny(
  path: string,
): Promise<{ buffer: Buffer; fileName: string; fileType: string }> {
  const { bunnyStorageBucketName, bunnyStorageAccessKey } = config;

  if (!bunnyStorageBucketName || !bunnyStorageAccessKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "Bunny storage not configured",
    });
  }

  const url = `https://storage.bunnycdn.com/${bunnyStorageBucketName}/${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      AccessKey: bunnyStorageAccessKey,
    },
  });

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to fetch file from storage",
      message: `Bunny CDN returned ${response.status}`,
    });
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileName = path.split("/").pop() || "poster.pdf";
  const fileType = response.headers.get("Content-Type") || "application/pdf";

  return { buffer, fileName, fileType };
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { user } = session;
  const userId = user.id;

  const { posterExtractionApi } = config;

  if (!posterExtractionApi) {
    throw createError({
      statusCode: 503,
      statusMessage: "Extraction API not configured",
      message: "NUXT_POSTER_EXTRACTION_API environment variable is not set",
    });
  }

  const contentType = getHeader(event, "content-type") ?? "";
  let fileBuffer: Buffer;
  let fileName: string;
  let fileType: string;

  if (contentType.includes("application/json")) {
    const body = await readBody<{ bunnyPath: string }>(event);
    const bunnyPath = body?.bunnyPath;

    if (!bunnyPath || typeof bunnyPath !== "string") {
      throw createError({
        statusCode: 400,
        statusMessage: "bunnyPath is required when using JSON body",
      });
    }

    const file = await getFileFromBunny(bunnyPath);
    fileBuffer = file.buffer;
    fileName = file.fileName;
    fileType = file.fileType;
  } else {
    const formData = await readMultipartFormData(event);

    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "No file provided",
      });
    }

    const fileEntry = formData.find(
      (entry) => entry.name === "file" && entry.filename,
    );

    if (!fileEntry || !fileEntry.data) {
      throw createError({
        statusCode: 400,
        statusMessage: "File not found in request",
      });
    }

    fileBuffer = Buffer.from(fileEntry.data);
    fileName = fileEntry.filename || "poster.pdf";
    fileType = fileEntry.type || "application/pdf";
  }

  const job = await prisma.extractionJob.create({
    data: {
      status: "pending",
    },
  });

  setImmediate(() => {
    processExtraction(
      job.id,
      userId,
      fileBuffer,
      fileName,
      fileType,
      posterExtractionApi,
    ).catch((error) => {
      console.error(
        `[Job ${job.id}] Unhandled error in background processing:`,
        error,
      );
    });
  });

  return {
    jobId: job.id,
    status: "pending",
  };
});
