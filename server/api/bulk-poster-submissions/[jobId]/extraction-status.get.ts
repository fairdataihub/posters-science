import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import type { BulkImportExtractionStatusResponse } from "#shared/types/bulkPosterSubmissionJob";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import prisma from "~~/server/utils/prisma";

/**
 * Status of every extraction job in one bulk import, in a single query, so the
 * wizard polls once per interval instead of once per poster.
 */
export default defineEventHandler(
  async (event): Promise<BulkImportExtractionStatusResponse> => {
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

    const summary = (job.submissionSummary ??
      {}) as BulkImportSubmissionSummary;
    const extractionJobIds = [
      ...new Set(
        (summary.createdPosters ?? [])
          .map((entry) => entry?.extractionJobId)
          .filter((id): id is string => typeof id === "string" && id !== ""),
      ),
    ];

    if (extractionJobIds.length === 0) return { jobs: [] };

    const rows = await prisma.extractionJob.findMany({
      where: {
        id: { in: extractionJobIds },
        poster: { userId: session.user.id },
      },
      select: {
        id: true,
        posterId: true,
        status: true,
        completed: true,
        error: true,
        poster: { select: { imageUrl: true } },
      },
    });

    return {
      jobs: rows.map((row) => ({
        jobId: row.id,
        posterId: row.posterId,
        status: row.status,
        completed: row.completed,
        error: row.error,
        imageUrl: row.poster.imageUrl,
      })),
    };
  },
);
