import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import type { BulkImportStagedPoster } from "#shared/types/bulkPosterSubmissionJob";
import type { BulkPosterSubmissionJob } from "#shared/types/bulkPosterSubmissionJob";
import {
  bulkImportFolderExtension,
  isBulkImportPosterObjectPath,
} from "~~/server/utils/bulkImportBunnyPaths";
import { deleteBunnyPosterObjectFolder } from "~~/server/utils/bulkImportBunnyDelete";
import { deleteUserDraftPoster } from "~~/server/utils/deleteUserDraftPoster";
import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";
import prisma from "~~/server/utils/prisma";

export type BulkImportPosterRemovalSpec = {
  /** Staged object path under this bulk job. */
  filePath?: string;
  /** Draft poster created when the batch was submitted. */
  posterId?: number;
};

export type RemovePostersFromBulkImportJobResult = {
  job: BulkPosterSubmissionJob;
  removedCount: number;
  removedFileNames: string[];
};

type CreatedPosterEntry = NonNullable<
  BulkImportSubmissionSummary["createdPosters"]
>[number];

type ResolvedRemoval = {
  posterId?: number;
  fileName: string;
  filePath?: string;
};

function parseStagedPosters(value: unknown): BulkImportStagedPoster[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is BulkImportStagedPoster =>
      item &&
      typeof item === "object" &&
      typeof (item as BulkImportStagedPoster).fileName === "string" &&
      typeof (item as BulkImportStagedPoster).filePath === "string",
  );
}

function filterLicenseSpreadsheetRows(
  rows: unknown[] | undefined,
  removedFileNames: Set<string>,
): unknown[] | undefined {
  if (!Array.isArray(rows)) return undefined;
  if (removedFileNames.size === 0) return rows;

  return rows.filter((row) => {
    if (!row || typeof row !== "object") return true;
    const fileName = (row as { fileName?: string }).fileName;
    if (!fileName) return true;
    return !removedFileNames.has(fileName);
  });
}

function removalKey(removal: ResolvedRemoval) {
  if (removal.posterId != null) return `poster:${removal.posterId}`;
  if (removal.filePath) return `path:${removal.filePath}`;
  return `name:${removal.fileName}`;
}

function resolveRemovals(
  created: CreatedPosterEntry[],
  staged: BulkImportStagedPoster[],
  specs: BulkImportPosterRemovalSpec[],
): ResolvedRemoval[] {
  const byKey = new Map<string, ResolvedRemoval>();

  for (const spec of specs) {
    if (spec.posterId != null) {
      const entry = created.find((row) => row.posterId === spec.posterId);
      const resolved: ResolvedRemoval = {
        posterId: spec.posterId,
        fileName: entry?.fileName ?? `poster-${spec.posterId}`,
        filePath: entry?.filePath,
      };
      byKey.set(removalKey(resolved), resolved);
      continue;
    }

    const filePath = spec.filePath?.trim();
    if (!filePath) continue;

    const createdEntry = created.find((row) => row.filePath === filePath);
    const stagedEntry = staged.find((row) => row.filePath === filePath);

    if (!createdEntry && !stagedEntry) {
      throw createError({
        statusCode: 404,
        statusMessage: "Poster file not found in this import",
      });
    }

    const resolved: ResolvedRemoval = {
      posterId: createdEntry?.posterId,
      fileName:
        createdEntry?.fileName ??
        stagedEntry?.fileName ??
        filePath.split("/").pop() ??
        filePath,
      filePath,
    };
    byKey.set(removalKey(resolved), resolved);
  }

  return [...byKey.values()];
}

async function deleteBunnyObjectIfConfigured(filePath: string, jobId: string) {
  const config = useRuntimeConfig();
  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;
  const siteEnv = config.siteEnv || config.public.siteEnv;
  const folderExtension = bulkImportFolderExtension(siteEnv);

  if (
    !bunnyPrivateStorage ||
    !bunnyPrivateStorageKey ||
    !isBulkImportPosterObjectPath(filePath, folderExtension, jobId)
  ) {
    return;
  }

  await deleteBunnyPosterObjectFolder({
    bunnyPrivateStorage,
    bunnyPrivateStorageKey,
    filePath,
  });
}

async function assertDraftPosterRemovable(
  userId: string,
  posterId: number,
): Promise<void> {
  const result = await deleteUserDraftPoster(userId, posterId);
  if (!result.deleted && result.reason !== "not_found") {
    throw createError({
      statusCode: 409,
      statusMessage:
        result.reason === "published"
          ? "This poster was already published and cannot be removed from the batch."
          : "Could not remove this poster from the batch.",
    });
  }
}

export async function removePostersFromBulkImportJob(
  userId: string,
  jobId: string,
  specs: BulkImportPosterRemovalSpec[],
): Promise<RemovePostersFromBulkImportJobResult> {
  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, userId);

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  if (specs.length === 0) {
    return { job, removedCount: 0, removedFileNames: [] };
  }

  const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  const created = summary.createdPosters ?? [];
  const staged = parseStagedPosters(job.stagedPosters);
  const removals = resolveRemovals(created, staged, specs);

  if (removals.length === 0) {
    return { job, removedCount: 0, removedFileNames: [] };
  }

  const removedPosterIds = new Set<number>();
  const removedFileNames = new Set<string>();
  const removedPaths = new Set<string>();

  for (const removal of removals) {
    removedFileNames.add(removal.fileName);
    if (removal.filePath) removedPaths.add(removal.filePath);

    if (removal.posterId != null) {
      await assertDraftPosterRemovable(userId, removal.posterId);
      removedPosterIds.add(removal.posterId);
      continue;
    }

    if (removal.filePath) {
      await deleteBunnyObjectIfConfigured(removal.filePath, jobId);
    }
  }

  const remainingCreated = created.filter(
    (entry) => !removedPosterIds.has(entry.posterId),
  );
  const nextStaged = staged.filter(
    (poster) => !removedPaths.has(poster.filePath),
  );

  const nextSummary: BulkImportSubmissionSummary = {
    ...summary,
    createdPosters: remainingCreated,
    createdPosterIds: remainingCreated.map((entry) => entry.posterId),
  };

  const filteredLicenseRows = filterLicenseSpreadsheetRows(
    summary.licenseSpreadsheetRows,
    removedFileNames,
  );
  if (filteredLicenseRows !== undefined) {
    nextSummary.licenseSpreadsheetRows = filteredLicenseRows;
  }

  const updated = await repository.updateForUser(jobId, userId, {
    submissionSummary: nextSummary,
    stagedPosters: nextStaged,
    posterCount: nextStaged.length,
  });

  return {
    job: updated,
    removedCount: removals.length,
    removedFileNames: [...removedFileNames],
  };
}

export async function removeBulkImportPosterByFilePath(
  userId: string,
  jobId: string,
  filePath: string,
) {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw createError({
      statusCode: 400,
      statusMessage: "filePath is required",
    });
  }

  const config = useRuntimeConfig();
  const siteEnv = config.siteEnv || config.public.siteEnv;
  const folderExtension = bulkImportFolderExtension(siteEnv);

  if (!isBulkImportPosterObjectPath(trimmed, folderExtension, jobId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid file path",
    });
  }

  return await removePostersFromBulkImportJob(userId, jobId, [
    { filePath: trimmed },
  ]);
}

export async function discardFailedBulkExtractions(
  userId: string,
  jobId: string,
): Promise<RemovePostersFromBulkImportJobResult> {
  const repository = getBulkPosterSubmissionJobRepository();
  const job = await repository.getByIdForUser(jobId, userId);

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bulk import not found",
    });
  }

  const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  const created = summary.createdPosters ?? [];

  if (created.length === 0) {
    return { job, removedCount: 0, removedFileNames: [] };
  }

  const posterIds = created.map((entry) => entry.posterId);
  const extractionJobs = await prisma.extractionJob.findMany({
    where: {
      posterId: { in: posterIds },
      poster: { userId },
    },
    select: { posterId: true, status: true },
  });

  const failedPosterIds = extractionJobs
    .filter((row) => row.status === "failed")
    .map((row) => row.posterId);

  if (failedPosterIds.length === 0) {
    return { job, removedCount: 0, removedFileNames: [] };
  }

  return await removePostersFromBulkImportJob(
    userId,
    jobId,
    failedPosterIds.map((posterId) => ({ posterId })),
  );
}
