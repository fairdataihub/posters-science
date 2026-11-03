import prisma from "~~/server/utils/prisma";

/**
 * Bulk extraction-level gating runs ONCE per poster, right after extraction,
 * so it only ever strips extracted values and never what the user typed later.
 * Which posters have been gated is recorded in the bulk job's
 * submissionSummary under this key (no schema change). Claims are atomic so
 * concurrent reads cannot both gate the same poster.
 */
export const BULK_GATED_POSTER_IDS_KEY = "extractionGatedPosterIds";

/** Atomically mark a poster as gated; true only for the caller that claimed it. */
export async function claimBulkPosterGating(
  jobId: string,
  posterId: number,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "BulkSubmission"
    SET "submissionSummary" = jsonb_set(
      COALESCE("submissionSummary", '{}'::jsonb),
      '{extractionGatedPosterIds}',
      COALESCE("submissionSummary"->'extractionGatedPosterIds', '[]'::jsonb)
        || to_jsonb(${posterId}::int)
    )
    WHERE id = ${jobId}
      AND NOT (
        COALESCE("submissionSummary"->'extractionGatedPosterIds', '[]'::jsonb)
          @> to_jsonb(${posterId}::int)
      )
    RETURNING id
  `;
  return rows.length > 0;
}

/** Re-extraction writes fresh metadata: allow gating again for this poster. */
export async function releaseBulkPosterGating(posterId: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "BulkSubmission"
    SET "submissionSummary" = jsonb_set(
      "submissionSummary",
      '{extractionGatedPosterIds}',
      COALESCE(
        (
          SELECT jsonb_agg(entry)
          FROM jsonb_array_elements("submissionSummary"->'extractionGatedPosterIds') AS entry
          WHERE entry <> to_jsonb(${posterId}::int)
        ),
        '[]'::jsonb
      )
    )
    WHERE "submissionSummary"->'extractionGatedPosterIds' @> to_jsonb(${posterId}::int)
  `;
}

function gatedIds(summary: unknown): number[] {
  if (!summary || typeof summary !== "object") return [];
  const raw = (summary as Record<string, unknown>)[BULK_GATED_POSTER_IDS_KEY];
  return Array.isArray(raw)
    ? raw.filter((value): value is number => typeof value === "number")
    : [];
}

/**
 * Keep gating markers when a whole submissionSummary is replaced (e.g. a client
 * merge built from an older read), so posters are never gated twice.
 */
export function preserveBulkGatingMarkers<T>(next: T, existing: unknown): T {
  if (!next || typeof next !== "object") return next;
  const merged = [
    ...new Set([...gatedIds(existing), ...gatedIds(next)]),
  ];
  if (merged.length === 0) return next;
  return { ...(next as Record<string, unknown>), [BULK_GATED_POSTER_IDS_KEY]: merged } as T;
}
