import type { PosterResponse } from "~~/app/utils/poster_schema";
import {
  validatePosterResponseStrictForm,
  type PosterStrictValidationIssue,
} from "~~/app/utils/posterResponseToStrictForm";
import { orderedBulkImportPosterEntries } from "~~/server/utils/bulkImportOrderedPosters";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

export type BulkPosterValidationResult = {
  posterId: number;
  issues: PosterStrictValidationIssue[];
};

/** Same shape GET /api/poster/[id] returns for the fields strict validation reads. */
function posterResponseFromRecord(poster: {
  id: number;
  title: string;
  description: string;
  posterMetadata: Record<string, unknown> | null;
}): PosterResponse {
  const meta = poster.posterMetadata;
  if (!meta) {
    return { id: poster.id, title: poster.title, description: poster.description } as PosterResponse;
  }

  const rawPosterContent = meta.posterContent as
    | { sections?: unknown[]; unstructuredContent?: string }
    | unknown[]
    | null;
  const posterContent = Array.isArray(rawPosterContent)
    ? { sections: rawPosterContent, unstructuredContent: "" }
    : (rawPosterContent ?? { sections: [], unstructuredContent: "" });

  const datesArr = Array.isArray(meta.dates)
    ? (meta.dates as Array<{ date?: string; dateType?: string }>)
    : [];
  const presentedEntry = datesArr.find((d) => d.dateType === "Presented");
  let presentedStartDate = "";
  let presentedEndDate = "";
  if (presentedEntry?.date) {
    const parts = presentedEntry.date.split("/");
    presentedStartDate = parts[0] ?? "";
    presentedEndDate = parts[1] ?? parts[0] ?? "";
  }

  return {
    id: poster.id,
    title: poster.title,
    description: poster.description,
    posterMetadata: {
      ...meta,
      posterContent,
      conference: {
        conferenceName: meta.conferenceName,
        conferenceLocation: meta.conferenceLocation,
        conferenceUri: meta.conferenceUri,
        conferenceIdentifier: meta.conferenceIdentifier,
        conferenceIdentifierType: meta.conferenceIdentifierType,
        conferenceYear: meta.conferenceYear,
        conferenceStartDate: meta.conferenceStartDate,
        conferenceEndDate: meta.conferenceEndDate,
        conferenceAcronym: meta.conferenceAcronym,
        conferenceSeries: meta.conferenceSeries,
        presentedStartDate,
        presentedEndDate,
      },
    },
  } as unknown as PosterResponse;
}

/** One poster's preview status plus its strict-form validation. */
export type BulkPosterPreviewSummary = BulkPosterValidationResult & {
  /** False when the poster is not in this database (deleted or not owned). */
  found: boolean;
  imageUrl: string;
  status: string;
  extractionJob: { status: string; completed: boolean } | null;
};

/**
 * Preview status and strict-form validation for every poster in a bulk job,
 * from one poster query. Validates stored data as-is, matching what the
 * poster editor shows.
 */
export async function bulkJobPosterSummaries(
  userId: string,
  jobId: string,
): Promise<BulkPosterPreviewSummary[]> {
  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, userId);
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Bulk import not found" });
  }

  const ordered = orderedBulkImportPosterEntries(job.submissionSummary);
  const posterIds = ordered.map((entry) => entry.posterId);
  if (posterIds.length === 0) return [];

  const posters = await prisma.poster.findMany({
    where: { id: { in: posterIds }, userId },
    include: {
      posterMetadata: true,
      extractionJob: { select: { status: true, completed: true } },
    },
  });
  const byId = new Map(posters.map((poster) => [poster.id, poster]));

  return posterIds.map((posterId): BulkPosterPreviewSummary => {
    const poster = byId.get(posterId);
    if (!poster) {
      return {
        posterId,
        found: false,
        imageUrl: "",
        status: "",
        extractionJob: null,
        issues: [{ path: "", message: "Poster could not be found." }],
      };
    }

    const result = validatePosterResponseStrictForm(
      posterResponseFromRecord({
        id: poster.id,
        title: poster.title,
        description: poster.description,
        posterMetadata: poster.posterMetadata as Record<string, unknown> | null,
      }),
    );

    return {
      posterId,
      found: true,
      imageUrl: poster.imageUrl ?? "",
      status: poster.status,
      extractionJob: poster.extractionJob,
      issues: result.valid ? [] : result.issues,
    };
  });
}

/**
 * Strict-form validation for every poster in a bulk job, in one query.
 * Replaces one GET /api/poster/[id] per poster from the metadata grid.
 */
export async function validateBulkJobPosters(
  userId: string,
  jobId: string,
): Promise<BulkPosterValidationResult[]> {
  const summaries = await bulkJobPosterSummaries(userId, jobId);

  return summaries.map(({ posterId, issues }) => ({ posterId, issues }));
}
