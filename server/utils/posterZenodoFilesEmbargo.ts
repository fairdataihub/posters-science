import {
  isZenodoFileEmbargoActive,
  zenodoFileEmbargoUntilDate,
} from "#shared/utils/zenodoFileEmbargoAccess";
import { bulkZenodoFileEmbargoDaysForPoster } from "~~/server/utils/bulkImportZenodoEmbargo";

type PosterEmbargoSource = {
  id: number;
  status: string;
  publishedAt: Date | null;
  zenodoDepositions: { filesEmbargoUntil: string | null } | null;
};

/**
 * Resolved Zenodo file embargo end date for dashboard and API responses.
 * Prefers the value stored on publish; falls back to bulk batch settings + publish time.
 */
export async function resolvePosterZenodoFilesEmbargoUntil(
  poster: PosterEmbargoSource,
  userId: string,
): Promise<string | null> {
  const stored = poster.zenodoDepositions?.filesEmbargoUntil?.trim();
  if (stored) return stored.slice(0, 10);

  if (poster.status !== "published" || !poster.publishedAt) return null;

  const days = await bulkZenodoFileEmbargoDaysForPoster(userId, poster.id);
  if (days == null) return null;

  return zenodoFileEmbargoUntilDate(days, poster.publishedAt);
}

export function posterDashboardEmbargoActive(
  zenodoFilesEmbargoUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return isZenodoFileEmbargoActive(zenodoFilesEmbargoUntil, now);
}

export function posterCountsAsDashboardInProgress(
  status: string,
  zenodoFilesEmbargoUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return (
    status !== "published" ||
    posterDashboardEmbargoActive(zenodoFilesEmbargoUntil, now)
  );
}
