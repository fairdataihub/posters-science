import { mockBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs/mockRepository";
import type { BulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs/repository.types";

/**
 * Single entry point for bulk submission persistence.
 * Replace `mockBulkPosterSubmissionJobRepository` with a Prisma-backed
 * implementation without changing API routes or the client API helper.
 */
const repository: BulkPosterSubmissionJobRepository =
  mockBulkPosterSubmissionJobRepository;

export function getBulkPosterSubmissionJobRepository(): BulkPosterSubmissionJobRepository {
  return repository;
}

export type { BulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs/repository.types";
