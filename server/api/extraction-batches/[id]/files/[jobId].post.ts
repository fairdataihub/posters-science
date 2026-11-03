import { posterFileRejectionReason } from "#shared/utils/posterFile";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  await assertNotInMaintenance("extraction");
  const id = getRouterParam(event, "jobId")!;
  const batchId = getRouterParam(event, "id")!;
  const job = await prisma.extractionJob.findFirst({
    where: {
      id,
      batchId,
      batch: { userId: session.user.id },
      poster: { userId: session.user.id, status: "draft" },
    },
  });

  if (!job)
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  if (job.fileUploaded) return { jobId: id, status: job.status };

  // A batch admitted while the feature was enabled may finish uploading later.
  const config = useRuntimeConfig(event);
  if (!config.bunnyPrivateStorage || !config.bunnyPrivateStorageKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "File storage is unavailable",
    });
  }

  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.name === "file" && part.filename);
  if (!file?.filename)
    throw createError({ statusCode: 400, statusMessage: "File is required" });
  const reason = posterFileRejectionReason({
    name: file.filename,
    type: file.type || "",
    size: file.data.length,
  });
  if (reason)
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid file",
      message: reason,
    });
  if (
    file.filename.replace(/[^a-zA-Z0-9._-]/g, "_") !== job.fileName ||
    file.data.length !== job.fileSize
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "File does not match this batch entry",
    });
  }

  const claimed = await prisma.extractionJob.updateMany({
    where: {
      id,
      fileUploaded: false,
      status: { in: ["pending-upload", "failed"] },
    },
    data: { status: "uploading", completed: false, error: null },
  });
  if (!claimed.count)
    throw createError({
      statusCode: 409,
      statusMessage: "This file is already being uploaded",
    });

  try {
    const response = await fetch(
      `${config.bunnyPrivateStorage}/${job.filePath}`,
      {
        method: "PUT",
        headers: {
          AccessKey: config.bunnyPrivateStorageKey,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file.data as BodyInit,
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!response.ok) throw new Error("Storage rejected the upload");

    const queued = await prisma.extractionJob.updateMany({
      where: { id, status: "uploading", fileUploaded: false, completed: false },
      data: {
        fileUploaded: true,
        status: "pending-extraction",
        completed: false,
        error: null,
      },
    });
    if (!queued.count)
      throw new Error("Upload expired before it could be queued");
  } catch {
    await prisma.extractionJob.updateMany({
      where: { id, status: "uploading", fileUploaded: false },
      data: {
        completed: true,
        status: "failed",
        error: "File upload failed. Select this file again to retry.",
      },
    });
    throw createError({
      statusCode: 502,
      statusMessage: "File upload failed. Please retry this file.",
    });
  }

  wakeExtractionWorker(id, "batch/upload");

  return { jobId: id, status: "pending-extraction" };
});
