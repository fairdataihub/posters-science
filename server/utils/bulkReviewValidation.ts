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

/**
 * Strict-form validation for every poster in a bulk job, in one query.
 * Replaces one GET /api/poster/[id] per poster from the metadata grid.
 * Validates stored data as-is, matching what the poster editor shows.
 */
export async function validateBulkJobPosters(
  userId: string,
  jobId: string,
): Promise<BulkPosterValidationResult[]> {
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
    },
  });
  const byId = new Map(posters.map((poster) => [poster.id, poster]));

  const results: BulkPosterValidationResult[] = [];
  for (const posterId of posterIds) {
    const poster = byId.get(posterId);
    if (!poster) {
      results.push({
        posterId,
        issues: [{ path: "", message: "Poster could not be found." }],
      });
      continue;
    }

    // Stored data is the source of truth: extraction-level gating already ran
    // once after extraction, so validate exactly what the poster editor shows.
    const title = poster.title;
    const description = poster.description;
    const meta = poster.posterMetadata as Record<string, unknown> | null;

    const result = validatePosterResponseStrictForm(
      posterResponseFromRecord({ id: poster.id, title, description, posterMetadata: meta }),
    );
    results.push({ posterId, issues: result.valid ? [] : result.issues });
  }

  return results;
}
