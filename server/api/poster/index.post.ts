import { processExtraction } from "~~/server/utils/posterExtraction";

const config = useRuntimeConfig();

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { user } = session;
  const userId = user.id;

  const posterExtractionApi = config.posterExtractionApi;

  if (!posterExtractionApi) {
    throw createError({
      statusCode: 503,
      statusMessage: "Extraction API not configured",
      message: "NUXT_POSTER_EXTRACTION_API environment variable is not set",
    });
  }

  // Read multipart form data
  const formData = await readMultipartFormData(event);

  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "No file provided",
    });
  }

  // Find the file in the form data
  const fileEntry = formData.find(
    (entry) => entry.name === "file" && entry.filename,
  );

  if (!fileEntry || !fileEntry.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "File not found in request",
    });
  }

  // Create a job record in the database
  const job = await prisma.extractionJob.create({
    data: {
      userId,
      status: "pending",
    },
  });

  // Copy file data to a new buffer (so it persists after request ends)
  const fileBuffer = Buffer.from(fileEntry.data);
  const fileName = fileEntry.filename || "poster.pdf";
  const fileType = fileEntry.type || "application/pdf";

  // Start background processing (fire and forget)
  // Using setImmediate to ensure the response is sent before processing starts
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

  // Return job ID immediately (client will poll for status)
  return {
    jobId: job.id,
    status: "pending",
  };
});
