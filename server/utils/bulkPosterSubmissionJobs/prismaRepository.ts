import { createError } from "h3";
import { Prisma } from "#shared/generated/client";
import type { BulkPosterSubmissionJob } from "#shared/types/bulkPosterSubmissionJob";
import type { BulkImportStagedPoster } from "#shared/types/bulkPosterSubmissionJob";
import {
  DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD,
  normalizeBulkSubmissionExtractionMethod,
  type BulkSubmissionExtractionMethod,
} from "#shared/types/bulkSubmission";
import prisma from "~~/server/utils/prisma";
import type {
  BulkPosterSubmissionJobRepository,
  CreateBulkPosterSubmissionJobInput,
} from "~~/server/utils/bulkPosterSubmissionJobs/repository.types";
import type { UpdateBulkPosterSubmissionJobBody } from "#shared/types/bulkPosterSubmissionJob";

type BulkSubmissionRow = {
  id: string;
  userId: string;
  name: string;
  wizardStep: string;
  status: string;
  extractionMethod: string;
  stagedPosters: unknown;
  licenseMetadataFileName: string | null;
  licenseMetadataFilePath: string | null;
  zipFileName: string | null;
  zipFilePath: string | null;
  posterCount: number | null;
  submissionSummary: unknown;
  error: string | null;
  managedConferenceId: string | null;
  completedAt: Date | null;
  created: Date;
  updated: Date;
};

function parseExtractionMethod(value: string): BulkSubmissionExtractionMethod {
  return normalizeBulkSubmissionExtractionMethod(value);
}

function parseStagedPosters(value: unknown): BulkImportStagedPoster[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is BulkImportStagedPoster =>
      !!item &&
      typeof item === "object" &&
      "fileName" in item &&
      typeof (item as BulkImportStagedPoster).fileName === "string" &&
      "filePath" in item &&
      typeof (item as BulkImportStagedPoster).filePath === "string" &&
      "uploadedAt" in item &&
      typeof (item as BulkImportStagedPoster).uploadedAt === "string",
  );
}

function toApiJob(record: BulkSubmissionRow): BulkPosterSubmissionJob {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    wizardStep: record.wizardStep as BulkPosterSubmissionJob["wizardStep"],
    status: record.status as BulkPosterSubmissionJob["status"],
    extractionMethod: parseExtractionMethod(record.extractionMethod),
    stagedPosters: parseStagedPosters(record.stagedPosters),
    licenseMetadataFileName: record.licenseMetadataFileName,
    licenseMetadataFilePath: record.licenseMetadataFilePath,
    zipFileName: record.zipFileName,
    zipFilePath: record.zipFilePath,
    posterCount: record.posterCount,
    submissionSummary: record.submissionSummary ?? null,
    error: record.error,
    managedConferenceId: record.managedConferenceId,
    createdAt: record.created.toISOString(),
    updatedAt: record.updated.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
  };
}

function buildUpdateData(
  patch: UpdateBulkPosterSubmissionJobBody,
): Prisma.BulkSubmissionUpdateInput {
  const data: Prisma.BulkSubmissionUpdateInput = {};

  if (patch.name !== undefined) {
    data.name = patch.name.trim();
  }
  if (patch.wizardStep !== undefined) {
    data.wizardStep = patch.wizardStep;
  }
  if (patch.status !== undefined) {
    data.status = patch.status;
  }
  if (patch.extractionMethod !== undefined) {
    data.extractionMethod = patch.extractionMethod;
  }
  if (patch.stagedPosters !== undefined) {
    data.stagedPosters = patch.stagedPosters as Prisma.InputJsonValue;
  }
  if (patch.licenseMetadataFileName !== undefined) {
    data.licenseMetadataFileName = patch.licenseMetadataFileName;
  }
  if (patch.licenseMetadataFilePath !== undefined) {
    data.licenseMetadataFilePath = patch.licenseMetadataFilePath;
  }
  if (patch.zipFileName !== undefined) {
    data.zipFileName = patch.zipFileName;
  }
  if (patch.zipFilePath !== undefined) {
    data.zipFilePath = patch.zipFilePath;
  }
  if (patch.posterCount !== undefined) {
    data.posterCount = patch.posterCount;
  }
  if (patch.submissionSummary !== undefined) {
    data.submissionSummary =
      patch.submissionSummary === null
        ? Prisma.JsonNull
        : (patch.submissionSummary as Prisma.InputJsonValue);
  }
  if (patch.error !== undefined) {
    data.error = patch.error;
  }
  if (patch.managedConferenceId !== undefined) {
    data.managedConferenceId = patch.managedConferenceId;
  }
  if (patch.completedAt !== undefined) {
    data.completedAt = patch.completedAt ? new Date(patch.completedAt) : null;
  }

  return data;
}

export const prismaBulkPosterSubmissionJobRepository: BulkPosterSubmissionJobRepository =
  {
    async create(input: CreateBulkPosterSubmissionJobInput) {
      const extractionMethod =
        input.extractionMethod ?? DEFAULT_BULK_SUBMISSION_EXTRACTION_METHOD;

      const record = await prisma.bulkSubmission.create({
        data: {
          userId: input.userId,
          name: input.name.trim(),
          wizardStep: "upload",
          status: "draft",
          extractionMethod,
          managedConferenceId: input.managedConferenceId ?? null,
          stagedPosters: [],
        },
      });

      return toApiJob(record);
    },

    async getByIdForUser(id, userId) {
      const record = await prisma.bulkSubmission.findFirst({
        where: { id, userId },
      });
      return record ? toApiJob(record) : null;
    },

    async listForUser(userId) {
      const records = await prisma.bulkSubmission.findMany({
        where: { userId },
        orderBy: { updated: "desc" },
      });
      return records.map(toApiJob);
    },

    async updateForUser(id, userId, patch) {
      const existing = await prisma.bulkSubmission.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        throw createError({
          statusCode: 404,
          statusMessage: "Bulk import not found",
        });
      }

      const record = await prisma.bulkSubmission.update({
        where: { id },
        data: buildUpdateData(patch),
      });

      return toApiJob(record);
    },
  };
