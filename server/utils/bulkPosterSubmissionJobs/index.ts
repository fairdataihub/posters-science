import { mockBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs/mockRepository";
import { prismaBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs/prismaRepository";
import type { BulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs/repository.types";

/**
 * Bulk import wizard persistence (`BulkSubmission` in Postgres).
 * Set `BULK_SUBMISSION_REPOSITORY=mock` to use in-memory storage (e.g. tests).
 */
const repository: BulkPosterSubmissionJobRepository =
  process.env.BULK_SUBMISSION_REPOSITORY === "mock"
    ? mockBulkPosterSubmissionJobRepository
    : prismaBulkPosterSubmissionJobRepository;

export function getBulkPosterSubmissionJobRepository(): BulkPosterSubmissionJobRepository {
  return repository;
}
