import archiver from "archiver";
import { Readable } from "node:stream";
import { sendStream, setHeader } from "h3";
import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { posterIdsFromBulkSubmissionSummary } from "~~/server/utils/bulkImportDashboard";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import {
  appendPosterDownloadPackage,
  uniquePosterFolderName,
} from "~~/server/utils/posterDownloadPackage";

function orderedPosterEntries(summary: unknown) {
  const typed = summary as BulkImportSubmissionSummary | null | undefined;
  if (typed?.createdPosters?.length) {
    return typed.createdPosters
      .filter((entry) => typeof entry.posterId === "number")
      .map((entry) => ({
        posterId: entry.posterId,
        fileName: entry.fileName?.trim() || `poster-${entry.posterId}.pdf`,
      }));
  }

  return posterIdsFromBulkSubmissionSummary(summary).map((posterId) => ({
    posterId,
    fileName: `poster-${posterId}.pdf`,
  }));
}

const INVALID_BULK_ZIP_FILENAME_CHARS = /[^a-zA-Z0-9._-]+/g;

function safeZipFilename(jobName: string, jobId: string) {
  const fromName = jobName
    .replace(INVALID_BULK_ZIP_FILENAME_CHARS, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const base = fromName || `bulk-import-${jobId.slice(0, 8)}`;
  return `${base}-posters.zip`;
}

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const jobId = getRouterParam(event, "jobId");

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job id is required",
    });
  }

  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, session.user.id);

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  const ordered = orderedPosterEntries(job.submissionSummary);
  if (ordered.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "This bulk import has no posters to download.",
    });
  }

  const posterIds = ordered.map((entry) => entry.posterId);

  const posters = await prisma.poster.findMany({
    where: {
      id: { in: posterIds },
      userId: session.user.id,
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

  const posterById = new Map(posters.map((poster) => [poster.id, poster]));

  const usedFolderNames = new Set<string>();
  const packages: Array<{
    poster: (typeof posters)[number];
    folderName: string;
  }> = [];

  for (const entry of ordered) {
    const poster = posterById.get(entry.posterId);
    if (!poster) {
      throw createError({
        statusCode: 404,
        statusMessage: `Poster ${entry.posterId} was not found for this bulk import.`,
      });
    }

    if (!poster.extractionJob?.filePath) {
      throw createError({
        statusCode: 422,
        statusMessage: `Poster files are not ready for ${entry.fileName}.`,
      });
    }

    packages.push({
      poster,
      folderName: uniquePosterFolderName(
        entry.fileName,
        entry.posterId,
        usedFolderNames,
      ),
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

  const archive = archiver("zip", { zlib: { level: 1 } });

  for (const { poster, folderName } of packages) {
    await appendPosterDownloadPackage(archive, poster, {
      pathPrefix: folderName,
      bunnyPrivateStorage,
      bunnyPrivateStorageKey,
    });
  }

  await prisma.poster.updateMany({
    where: {
      id: { in: posterIds },
      userId: session.user.id,
    },
    data: { status: "downloaded" },
  });

  const zipFilename = safeZipFilename(job.name, job.id);

  setHeader(event, "Content-Type", "application/zip");
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename="${zipFilename}"`,
  );

  const webStream = Readable.toWeb(
    archive as unknown as Readable,
  ) as ReadableStream;

  archive.finalize();

  return sendStream(event, webStream);
});
