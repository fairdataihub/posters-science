import { createError } from "h3";
import { createId } from "@paralleldrive/cuid2";
import type { BulkPosterSubmissionJob } from "#shared/types/bulkPosterSubmissionJob";
import type {
  BulkPosterSubmissionJobRepository,
  CreateBulkPosterSubmissionJobInput,
} from "~~/server/utils/bulkPosterSubmissionJobs/repository.types";

const jobsById = new Map<string, BulkPosterSubmissionJob>();

function nowIso() {
  return new Date().toISOString();
}

export const mockBulkPosterSubmissionJobRepository: BulkPosterSubmissionJobRepository =
  {
    async create(input: CreateBulkPosterSubmissionJobInput) {
      const timestamp = nowIso();
      const job: BulkPosterSubmissionJob = {
        id: createId(),
        userId: input.userId,
        name: input.name.trim(),
        wizardStep: "upload",
        status: "draft",
        stagedPosters: [],
        licenseMetadataFileName: null,
        licenseMetadataFilePath: null,
        zipFileName: null,
        zipFilePath: null,
        posterCount: null,
        submissionSummary: null,
        error: null,
        managedConferenceId: input.managedConferenceId ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
      };

      jobsById.set(job.id, job);
      return job;
    },

    async getByIdForUser(id, userId) {
      const job = jobsById.get(id);
      if (!job || job.userId !== userId) {
        return null;
      }
      return {
        ...job,
        stagedPosters: job.stagedPosters ?? [],
      };
    },

    async listForUser(userId) {
      return [...jobsById.values()]
        .filter((job) => job.userId === userId)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
    },

    async updateForUser(id, userId, patch) {
      const existing = await this.getByIdForUser(id, userId);
      if (!existing) {
        throw createError({
          statusCode: 404,
          statusMessage: "Bulk import not found",
        });
      }

      const updated: BulkPosterSubmissionJob = {
        ...existing,
        ...patch,
        name: patch.name?.trim() ?? existing.name,
        updatedAt: nowIso(),
      };

      jobsById.set(id, updated);
      return updated;
    },
  };
