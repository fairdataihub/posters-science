import { createError } from "h3";
import type { BulkImportStagedPoster } from "#shared/types/bulkPosterSubmissionJob";
import prisma from "~~/server/utils/prisma";
import type { Prisma } from "#shared/generated/client";
import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import type { BulkPosterSubmissionJob } from "#shared/types/bulkPosterSubmissionJob";
import { posterMetadataCreateFromBulkSubmissionSummary } from "~~/server/utils/bulkImportPosterMetadata";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

export type BulkSubmitCreatedPoster = {
  posterId: number;
  extractionJobId: string;
  fileName: string;
  filePath: string;
};

export type BulkSubmitResult = {
  job: BulkPosterSubmissionJob;
  posters: BulkSubmitCreatedPoster[];
};

function parseStagedPosters(value: unknown): BulkImportStagedPoster[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is BulkImportStagedPoster =>
      item &&
      typeof item === "object" &&
      typeof (item as BulkImportStagedPoster).fileName === "string" &&
      typeof (item as BulkImportStagedPoster).filePath === "string",
  );
}

export function posterTitleFromFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return base.length > 0 ? base : fileName;
}

function validateSummaryForSubmit(summary: BulkImportSubmissionSummary | null) {
  const license = summary?.uniformLicense?.trim();
  if (!license) {
    throw createError({
      statusCode: 400,
      statusMessage: "License is required before submit",
      message: "Choose a license on the conference information step.",
    });
  }

  const conference = summary?.conference;
  if (
    !conference?.conferenceName?.trim() ||
    conference.conferenceYear == null
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Conference information is incomplete",
      message: "Conference name and year are required before submit.",
    });
  }

  return { license, conference };
}

function existingCreatedPosters(summary: BulkImportSubmissionSummary) {
  return Array.isArray(summary.createdPosters) ? summary.createdPosters : [];
}

export function triggerPosterExtractionWorker() {
  const { posterExtractionApi } = useRuntimeConfig();
  if (!posterExtractionApi) return;

  setImmediate(() => {
    fetch(`${posterExtractionApi}/jobs/check`, { method: "POST" }).catch(
      (error) => {
        console.error("[bulk-import/submit] Failed to trigger jobs/check:", error);
      },
    );
  });
}

export async function submitBulkPosterSubmissionJob(
  userId: string,
  jobId: string,
): Promise<BulkSubmitResult> {
  if (process.env.BULK_SUBMISSION_REPOSITORY === "mock") {
    throw createError({
      statusCode: 503,
      statusMessage: "Bulk submit requires database persistence",
      message: "Unset BULK_SUBMISSION_REPOSITORY=mock to submit bulk imports.",
    });
  }

  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, userId);

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  if (job.status !== "draft" && job.status !== "processing") {
    throw createError({
      statusCode: 409,
      statusMessage: "Bulk import cannot accept more posters",
      message: `This batch is "${job.status}" and cannot be submitted again.`,
    });
  }

  // Fail fast on obvious problems before taking the row lock.
  if (parseStagedPosters(job.stagedPosters).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "No staged posters",
      message: "Add at least one poster file before submitting.",
    });
  }
  validateSummaryForSubmit(
    (job.submissionSummary ?? {}) as BulkImportSubmissionSummary,
  );

  const created: BulkSubmitCreatedPoster[] = [];
  let mergedCreated: NonNullable<
    BulkImportSubmissionSummary["createdPosters"]
  > = [];

  const bulkSubmitTransactionTimeoutMs = Math.min(
    Math.max(30_000, parseStagedPosters(job.stagedPosters).length * 5_000),
    120_000,
  );

  await prisma.$transaction(
    async (tx) => {
      // Serialize submits for this batch. Overlapping requests (auto-start
      // races, double clicks, a second tab, HMR remounts) previously each saw
      // "no extraction job for this path yet" and created duplicate posters.
      await tx.$queryRaw`SELECT id FROM "BulkSubmission" WHERE id = ${jobId} FOR UPDATE`;

      // Re-read under the lock so we see what an earlier submit committed.
      const locked = await tx.bulkSubmission.findFirst({
        where: { id: jobId, userId },
        select: { status: true, stagedPosters: true, submissionSummary: true },
      });
      if (!locked) {
        throw createError({
          statusCode: 404,
          statusMessage: "Bulk import not found",
        });
      }
      if (locked.status !== "draft" && locked.status !== "processing") {
        throw createError({
          statusCode: 409,
          statusMessage: "Bulk import cannot accept more posters",
          message: `This batch is "${locked.status}" and cannot be submitted again.`,
        });
      }

      const staged = parseStagedPosters(locked.stagedPosters);
      if (staged.length === 0) {
        throw createError({
          statusCode: 400,
          statusMessage: "No staged posters",
          message: "Add at least one poster file before submitting.",
        });
      }

      const existingSummary = (locked.submissionSummary ??
        {}) as BulkImportSubmissionSummary;
      const { license, conference } = validateSummaryForSubmit(existingSummary);

      const metadataCreate = posterMetadataCreateFromBulkSubmissionSummary({
        ...existingSummary,
        uniformLicense: license,
        conference,
      });
      if (!metadataCreate) {
        throw createError({
          statusCode: 500,
          statusMessage: "Failed to build poster metadata from bulk import",
        });
      }

      const priorCreated = existingCreatedPosters(existingSummary);
      const trackedPaths = new Set(
        priorCreated.map((entry) => entry.filePath).filter(Boolean),
      );

      function alreadyTracked(posterId: number) {
        return (
          priorCreated.some((entry) => entry.posterId === posterId) ||
          created.some((entry) => entry.posterId === posterId)
        );
      }

      const stagedPaths = staged.map((poster) => poster.filePath);
      const existingJobsForPaths = await tx.extractionJob.findMany({
        where: {
          filePath: { in: stagedPaths },
          poster: { userId },
        },
        select: { id: true, posterId: true, filePath: true },
        orderBy: { created: "asc" },
      });
      // Keep the oldest job per path if duplicates already exist.
      const existingJobByPath = new Map<
        string,
        (typeof existingJobsForPaths)[number]
      >();
      for (const existingJob of existingJobsForPaths) {
        if (!existingJobByPath.has(existingJob.filePath)) {
          existingJobByPath.set(existingJob.filePath, existingJob);
        }
      }

      const newPosterCount = staged.filter(
        (p) =>
          !trackedPaths.has(p.filePath) &&
          (p.posterId != null
            ? !alreadyTracked(p.posterId)
            : !existingJobByPath.has(p.filePath)),
      ).length;
      // One extraction batch row per wizard batch: posters added later (back
      // to step 1, then Start extraction again) join the same row, numbered
      // after the ones already there. Safe under the row lock above.
      let extractionBatch: { id: string } | null = null;
      let nextBatchIndex = 0;
      if (newPosterCount > 0) {
        const requestKey = `bulk-submission:${jobId}`;
        const existingBatch = await tx.extractionBatch.findUnique({
          where: { userId_requestKey: { userId, requestKey } },
          select: { id: true },
        });
        if (existingBatch) {
          extractionBatch = await tx.extractionBatch.update({
            where: { id: existingBatch.id },
            data: { name: job.name, totalFiles: { increment: newPosterCount } },
            select: { id: true },
          });
          const last = await tx.extractionJob.aggregate({
            where: { batchId: existingBatch.id },
            _max: { batchIndex: true },
          });
          nextBatchIndex = (last._max.batchIndex ?? -1) + 1;
        } else {
          extractionBatch = await tx.extractionBatch.create({
            data: { userId, requestKey, name: job.name, totalFiles: newPosterCount },
            select: { id: true },
          });
        }
      }

      for (const stagedPoster of staged) {
        if (trackedPaths.has(stagedPoster.filePath)) continue;

        if (stagedPoster.posterId != null) {
          if (alreadyTracked(stagedPoster.posterId)) continue;
          const poster = await tx.poster.update({
            where: { id: stagedPoster.posterId, userId },
            data: {
              posterMetadata: { create: metadataCreate },
              extractionJob: {
                update: {
                  status: "pending-extraction",
                  queueClass: "bulk",
                  batch: { connect: { id: extractionBatch!.id } },
                  batchIndex: nextBatchIndex++,
                },
              },
            },
            select: { id: true, extractionJob: { select: { id: true } } },
          });
          created.push({
            posterId: poster.id,
            extractionJobId: poster.extractionJob!.id,
            fileName: stagedPoster.fileName,
            filePath: stagedPoster.filePath,
          });
          continue;
        }

        const existingJobForPath = existingJobByPath.get(stagedPoster.filePath);
        if (existingJobForPath) {
          if (!alreadyTracked(existingJobForPath.posterId)) {
            created.push({
              posterId: existingJobForPath.posterId,
              extractionJobId: existingJobForPath.id,
              fileName: stagedPoster.fileName,
              filePath: stagedPoster.filePath,
            });
          }
          continue;
        }

        const poster = await tx.poster.create({
          data: {
            userId,
            title: posterTitleFromFileName(stagedPoster.fileName),
            description: "",
            imageUrl: "",
            status: "draft",
            posterMetadata: {
              create: metadataCreate,
            },
            extractionJob: {
              create: {
                fileName: stagedPoster.fileName,
                filePath: stagedPoster.filePath,
                status: "pending-extraction",
                queueClass: "bulk",
                batch: { connect: { id: extractionBatch!.id } },
                batchIndex: nextBatchIndex++,
              },
            },
          },
          include: {
            extractionJob: { select: { id: true } },
          },
        });

        const extractionJobId = poster.extractionJob?.id;
        if (!extractionJobId) {
          throw createError({
            statusCode: 500,
            statusMessage: "Failed to create extraction job",
          });
        }

        created.push({
          posterId: poster.id,
          extractionJobId,
          fileName: stagedPoster.fileName,
          filePath: stagedPoster.filePath,
        });
      }

      mergedCreated = [...priorCreated, ...created];
      const nextSummary: BulkImportSubmissionSummary = {
        ...existingSummary,
        createdPosterIds: mergedCreated.map((item) => item.posterId),
        createdPosters: mergedCreated,
        submittedAt: new Date().toISOString(),
      };

      // Written in the same transaction so the next submit sees these posters.
      await tx.bulkSubmission.update({
        where: { id: jobId },
        data: {
          status: "processing",
          wizardStep: "submit",
          submissionSummary: JSON.parse(
            JSON.stringify(nextSummary),
          ) as Prisma.InputJsonValue,
          error: null,
        },
      });
    },
    { maxWait: 10_000, timeout: bulkSubmitTransactionTimeoutMs },
  );

  const updated = await repository.getByIdForUser(jobId, userId);
  if (!updated) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  if (mergedCreated.length > 0) {
    triggerPosterExtractionWorker();
  }

  return { job: updated, posters: created };
}
