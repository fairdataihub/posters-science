import {
  findBulkSubmissionJobForPoster,
  gateBulkExtractedPosterMetadata,
} from "~~/server/utils/bulkExtractionMetadataGate";
import { ensurePostersScienceDiscoverRelatedIdentifier } from "~~/server/utils/postersScienceDiscoverRelatedIdentifier";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { user } = session;

  const { id: jobId } = event.context.params as { id: string };

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Job ID is required",
    });
  }

  const job = await prisma.extractionJob.findFirst({
    where: { id: jobId, poster: { userId: user.id } },
    include: {
      poster: { select: { imageUrl: true, title: true, description: true } },
    },
  });

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Job not found",
    });
  }

  if (job.completed && job.posterId) {
    const bulkJob = await findBulkSubmissionJobForPoster(user.id, job.posterId);
    if (bulkJob) {
      await gateBulkExtractedPosterMetadata(
        user.id,
        job.posterId,
        bulkJob.extractionMethod,
      );
    }
  }

  if (job.completed && job.posterId) {
    const config = useRuntimeConfig(event);
    const siteEnv = config.siteEnv || config.public.siteEnv;
    await ensurePostersScienceDiscoverRelatedIdentifier(job.posterId, {
      siteEnv,
    });
  }

  return {
    jobId: job.id,
    status: job.status,
    completed: job.completed,
    posterId: job.posterId,
    error: job.error,
    imageUrl: job.poster.imageUrl,
    title: job.poster.title,
    description: job.poster.description,
    // Timestamps let a polling client report elapsed time and flag a job that
    // has stalled rather than only showing an indeterminate spinner.
    startedAt: job.created,
    updatedAt: job.updated,
  };
});
