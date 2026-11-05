import type { BulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import { normalizeBulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import {
  gateBulkExtractedPosterSnapshot,
  stripFreshlyExtractedFieldsBelowLevel,
  type BulkExtractionGatedPosterSnapshot,
} from "#shared/bulkExtractionMetadataGate";
import { claimBulkPosterGating } from "~~/server/utils/bulkExtractionGateMarker";
import prisma from "~~/server/utils/prisma";
import { posterIdsFromBulkSubmissionSummary } from "~~/server/utils/bulkImportDashboard";

export async function findBulkSubmissionJobForPoster(
  userId: string,
  posterId: number,
): Promise<{ id: string; extractionMethod: BulkSubmissionExtractionMethod } | null> {
  const jobs = await prisma.bulkSubmission.findMany({
    where: {
      userId,
      status: { in: ["draft", "processing", "completed", "failed"] },
    },
    select: {
      id: true,
      extractionMethod: true,
      submissionSummary: true,
    },
    orderBy: { updated: "desc" },
  });

  for (const job of jobs) {
    const posterIds = posterIdsFromBulkSubmissionSummary(job.submissionSummary);
    if (posterIds.includes(posterId)) {
      return {
        id: job.id,
        extractionMethod: normalizeBulkSubmissionExtractionMethod(
          job.extractionMethod,
        ),
      };
    }
  }

  return null;
}

export function snapshotFromPoster(
  poster: {
    title: string;
    description: string;
    posterMetadata: {
      subjects: string[];
      language: string | null;
      domain: string | null;
      version: string | null;
      doi: string | null;
      publisher: string | null;
      publicationYear: number | null;
      creators: unknown;
      fundingReferences: unknown;
      relatedIdentifiers: unknown;
      posterContent: unknown;
      imageCaptions: unknown;
      tableCaptions: unknown;
      dates: unknown;
    };
  },
): BulkExtractionGatedPosterSnapshot {
  return {
    title: poster.title,
    description: poster.description,
    subjects: poster.posterMetadata.subjects,
    language: poster.posterMetadata.language,
    domain: poster.posterMetadata.domain,
    version: poster.posterMetadata.version,
    doi: poster.posterMetadata.doi,
    publisher: poster.posterMetadata.publisher,
    publicationYear: poster.posterMetadata.publicationYear,
    creators: poster.posterMetadata.creators,
    fundingReferences: poster.posterMetadata.fundingReferences,
    relatedIdentifiers: poster.posterMetadata.relatedIdentifiers,
    posterContent: poster.posterMetadata.posterContent,
    imageCaptions: poster.posterMetadata.imageCaptions,
    tableCaptions: poster.posterMetadata.tableCaptions,
    dates: poster.posterMetadata.dates,
  };
}

/**
 * One-time post-extraction cleanup for a bulk poster: strips extracted fields
 * above the batch's extraction level (including title/description/keywords,
 * which later reads must never touch).
 *
 * Runs at most once per poster (atomic claim in the bulk job summary), and
 * only after extraction has completed, so it never erases values the user
 * typed afterwards. Re-extraction releases the claim.
 */
export async function gateBulkExtractedPosterMetadata(
  userId: string,
  posterId: number,
  extractionMethod: BulkSubmissionExtractionMethod,
  options: { jobId?: string } = {},
): Promise<boolean> {
  const poster = await prisma.poster.findFirst({
    where: { id: posterId, userId },
    include: {
      posterMetadata: true,
      extractionJob: { select: { completed: true } },
    },
  });

  // Nothing extracted yet, or already published: nothing to gate.
  if (
    !poster?.posterMetadata ||
    !poster.extractionJob?.completed ||
    poster.status === "published"
  ) {
    return false;
  }

  const jobId =
    options.jobId ?? (await findBulkSubmissionJobForPoster(userId, posterId))?.id;
  if (!jobId) return false;

  // Already gated (by this or an earlier request): leave the data alone.
  if (!(await claimBulkPosterGating(jobId, posterId))) return false;

  let gated = false;

  if (extractionMethod !== "full") {
    const before = snapshotFromPoster({
      title: poster.title,
      description: poster.description,
      posterMetadata: poster.posterMetadata,
    });
    const after = stripFreshlyExtractedFieldsBelowLevel(
      extractionMethod,
      gateBulkExtractedPosterSnapshot(extractionMethod, before),
    );

    const metadataChanged =
      JSON.stringify(before.subjects) !== JSON.stringify(after.subjects) ||
      before.language !== after.language ||
      before.domain !== after.domain ||
      before.version !== after.version ||
      before.doi !== after.doi ||
      before.publisher !== after.publisher ||
      before.publicationYear !== after.publicationYear ||
      JSON.stringify(before.creators) !== JSON.stringify(after.creators) ||
      JSON.stringify(before.fundingReferences) !==
        JSON.stringify(after.fundingReferences) ||
      JSON.stringify(before.relatedIdentifiers) !==
        JSON.stringify(after.relatedIdentifiers) ||
      JSON.stringify(before.posterContent) !==
        JSON.stringify(after.posterContent) ||
      JSON.stringify(before.imageCaptions) !==
        JSON.stringify(after.imageCaptions) ||
      JSON.stringify(before.tableCaptions) !==
        JSON.stringify(after.tableCaptions) ||
      JSON.stringify(before.dates) !== JSON.stringify(after.dates);

    const posterChanged =
      before.title !== after.title || before.description !== after.description;

    if (metadataChanged || posterChanged) {
      await prisma.poster.update({
        where: { id: posterId },
        data: {
          title: after.title,
          description: after.description,
          posterMetadata: {
            update: {
              subjects: after.subjects,
              language: after.language,
              domain: after.domain,
              version: after.version,
              doi: after.doi,
              publisher: after.publisher,
              publicationYear: after.publicationYear,
              creators: after.creators as never,
              fundingReferences: after.fundingReferences as never,
              relatedIdentifiers: after.relatedIdentifiers as never,
              posterContent: after.posterContent as never,
              imageCaptions: after.imageCaptions as never,
              tableCaptions: after.tableCaptions as never,
              dates: after.dates as never,
            },
          },
        },
      });
      gated = true;
    }
  }

  // True when stored data changed, so callers re-read the poster.
  return gated;
}

export async function gateBulkExtractedPosterMetadataForJobPoster(
  userId: string,
  posterId: number,
  jobExtractionMethod: string,
  options: { jobId?: string } = {},
): Promise<boolean> {
  return gateBulkExtractedPosterMetadata(
    userId,
    posterId,
    normalizeBulkSubmissionExtractionMethod(jobExtractionMethod),
    options,
  );
}
