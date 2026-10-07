import type {
  BulkPosterSubmissionJob,
  CreateBulkPosterSubmissionJobBody,
  UpdateBulkPosterSubmissionJobBody,
} from "#shared/types/bulkPosterSubmissionJob";

export type CreateBulkPosterSubmissionJobInput =
  CreateBulkPosterSubmissionJobBody & {
    userId: string;
  };

/** Swap the implementation in index.ts when Prisma is ready. */
export type BulkPosterSubmissionJobRepository = {
  create(input: CreateBulkPosterSubmissionJobInput): Promise<BulkPosterSubmissionJob>;
  getByIdForUser(
    id: string,
    userId: string,
  ): Promise<BulkPosterSubmissionJob | null>;
  listForUser(userId: string): Promise<BulkPosterSubmissionJob[]>;
  updateForUser(
    id: string,
    userId: string,
    patch: UpdateBulkPosterSubmissionJobBody,
  ): Promise<BulkPosterSubmissionJob>;
};
