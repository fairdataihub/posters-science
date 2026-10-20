import { createError } from "h3";
import type { BulkImportStagedPoster } from "#shared/types/bulkPosterSubmissionJob";
import prisma from "~~/server/utils/prisma";
import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import type { BulkPosterSubmissionJob } from "#shared/types/bulkPosterSubmissionJob";
import { posterMetadataCreateFromBulkSubmissionSummary } from "~~/server/utils/bulkImportPosterMetadata";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

export type BulkSubmitCreatedPoster = {
  posterId: number;
  extractionJobId: string;
  fileName: string;
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

function posterTitleFromFileName(fileName: string) {
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

  if (job.status !== "draft") {
    throw createError({
      statusCode: 409,
      statusMessage: "Bulk import already submitted",
      message: `This batch is "${job.status}" and cannot be submitted again.`,
    });
  }

  const staged = parseStagedPosters(job.stagedPosters);
  if (staged.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "No staged posters",
      message: "Add at least one poster file before submitting.",
    });
  }

  const existingSummary = (job.submissionSummary ??
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

  const created: BulkSubmitCreatedPoster[] = [];

  await prisma.$transaction(async (tx) => {
    for (const stagedPoster of staged) {
      const poster = await tx.poster.create({
        data: {
          userId,
          title: posterTitleFromFileName(stagedPoster.fileName),
          description: "",
          imageUrl: "",
          status: "draft",
          automated: true,
          posterMetadata: {
            create: metadataCreate,
          },
          extractionJob: {
            create: {
              fileName: stagedPoster.fileName,
              filePath: stagedPoster.filePath,
              status: "pending-extraction",
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
      });
    }
  });

  const submittedAt = new Date().toISOString();
  const nextSummary: BulkImportSubmissionSummary = {
    ...existingSummary,
    createdPosterIds: created.map((item) => item.posterId),
    createdPosters: created,
    submittedAt,
  };

  const updated = await repository.updateForUser(jobId, userId, {
    status: "processing",
    wizardStep: "submit",
    submissionSummary: nextSummary,
    error: null,
  });

  triggerPosterExtractionWorker();

  return { job: updated, posters: created };
}
