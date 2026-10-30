import { createError } from "h3";
import type { Prisma } from "#shared/generated/client";
import type { BulkImportConferenceMetadata } from "#shared/types/bulkImportConference";
import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import prisma from "~~/server/utils/prisma";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import { gateBulkExtractedPosterMetadataForJobPoster } from "~~/server/utils/bulkExtractionMetadataGate";
import { ensurePostersScienceDiscoverRelatedIdentifier } from "~~/server/utils/postersScienceDiscoverRelatedIdentifier";

function optionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const OPTIONAL_BULK_CONFERENCE_FIELDS: {
  source: keyof BulkImportConferenceMetadata;
  target: keyof Prisma.PosterMetadataUpdateInput;
}[] = [
  { source: "conferenceLocation", target: "conferenceLocation" },
  { source: "conferenceUri", target: "conferenceUri" },
  { source: "conferenceIdentifier", target: "conferenceIdentifier" },
  {
    source: "conferenceIdentifierType",
    target: "conferenceIdentifierType",
  },
  { source: "conferenceStartDate", target: "conferenceStartDate" },
  { source: "conferenceEndDate", target: "conferenceEndDate" },
  { source: "conferenceAcronym", target: "conferenceAcronym" },
  { source: "conferenceSeries", target: "conferenceSeries" },
];

export function conferenceToPosterMetadataFields(
  conference: BulkImportConferenceMetadata,
): Prisma.PosterMetadataUpdateInput {
  const data: Prisma.PosterMetadataUpdateInput = {
    conferenceName: conference.conferenceName,
    conferenceYear: conference.conferenceYear,
  };

  for (const { source, target } of OPTIONAL_BULK_CONFERENCE_FIELDS) {
    if (source in conference) {
      data[target] = optionalString(conference[source]);
    }
  }

  return data;
}

export function posterMetadataCreateFromBulkSubmissionSummary(
  summary: BulkImportSubmissionSummary,
): Prisma.PosterMetadataCreateWithoutPosterInput | null {
  const license = summary.uniformLicense?.trim();
  const conference = summary.conference;
  if (!license || !conference?.conferenceName?.trim() || conference.conferenceYear == null) {
    return null;
  }

  return {
    license,
    ...conferenceToPosterMetadataFields(conference),
  };
}

export function posterMetadataUpdateFromBulkSubmissionSummary(
  summary: BulkImportSubmissionSummary,
): Prisma.PosterMetadataUpdateInput {
  const data: Prisma.PosterMetadataUpdateInput = {};
  const license = summary.uniformLicense?.trim();
  if (license) {
    data.license = license;
  }
  const conference = summary.conference;
  if (
    conference?.conferenceName?.trim() &&
    conference.conferenceYear != null
  ) {
    Object.assign(data, conferenceToPosterMetadataFields(conference));
  }
  return data;
}

function posterIdsFromBulkSummary(summary: BulkImportSubmissionSummary | null) {
  const ids = new Set<number>();
  if (!summary) return ids;

  if (Array.isArray(summary.createdPosterIds)) {
    for (const id of summary.createdPosterIds) {
      if (typeof id === "number") ids.add(id);
    }
  }
  if (Array.isArray(summary.createdPosters)) {
    for (const entry of summary.createdPosters) {
      if (entry && typeof entry.posterId === "number") ids.add(entry.posterId);
    }
  }
  return ids;
}

/**
 * Applies batch license + conference from the bulk wizard onto poster metadata.
 * Safe to call after extraction (restores fields the worker may have overwritten).
 */
export async function applyBulkSubmissionMetadataToPosters(
  userId: string,
  jobId: string,
  posterId?: number,
): Promise<{ updatedPosterIds: number[] }> {
  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, userId);

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  const updateData = posterMetadataUpdateFromBulkSubmissionSummary(summary);
  if (Object.keys(updateData).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bulk import has no license or conference to apply",
    });
  }

  const allowedIds = posterIdsFromBulkSummary(summary);
  if (allowedIds.size === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bulk import has no submitted posters yet",
    });
  }

  const targetIds = posterId != null ? [posterId] : [...allowedIds];
  if (posterId != null && !allowedIds.has(posterId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Poster is not part of this bulk import",
    });
  }

  const updatedPosterIds: number[] = [];

  for (const id of targetIds) {
    const owned = await prisma.poster.findFirst({
      where: { id, userId },
      select: {
        id: true,
        posterMetadata: { select: { posterId: true } },
        extractionJob: { select: { completed: true } },
      },
    });
    if (!owned) continue;

    if (owned.posterMetadata) {
      await prisma.posterMetadata.update({
        where: { posterId: id },
        data: updateData,
      });
    } else {
      const createData = posterMetadataCreateFromBulkSubmissionSummary(summary);
      if (!createData) continue;
      await prisma.posterMetadata.create({
        data: { posterId: id, ...createData },
      });
    }

    await gateBulkExtractedPosterMetadataForJobPoster(
      userId,
      id,
      job.extractionMethod,
    );

    if (owned.extractionJob?.completed) {
      const config = useRuntimeConfig();
      const siteEnv = config.siteEnv || config.public.siteEnv;
      await ensurePostersScienceDiscoverRelatedIdentifier(id, { siteEnv });
    }

    updatedPosterIds.push(id);
  }

  return { updatedPosterIds };
}
