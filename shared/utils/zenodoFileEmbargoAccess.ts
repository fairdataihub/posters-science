import { normalizeBulkImportReviewEmbargoDays } from "#shared/types/bulkImportReviewEmbargo";

/** InvenioRDM access block for Zenodo file embargo (record metadata public, files restricted). */
export type ZenodoRdmFileEmbargoAccess = {
  record: "public";
  files: "restricted";
  embargo: {
    active: true;
    until: string;
  };
};

export type ZenodoRdmPublicAccess = {
  record: "public";
  files: "public";
};

export type ZenodoRdmAccess = ZenodoRdmPublicAccess | ZenodoRdmFileEmbargoAccess;

export function zenodoPublicRdmAccess(): ZenodoRdmPublicAccess {
  return { record: "public", files: "public" };
}

/** Calendar date (UTC) when file embargo ends, `days` after `from`. */
export function zenodoFileEmbargoUntilDate(
  days: number,
  from: Date = new Date(),
): string {
  const normalized = normalizeBulkImportReviewEmbargoDays(days);
  const end = new Date(from);
  end.setUTCDate(end.getUTCDate() + normalized);
  return end.toISOString().slice(0, 10);
}

export function zenodoFileEmbargoAccessFromDays(
  days: number,
  from: Date = new Date(),
): ZenodoRdmFileEmbargoAccess {
  return {
    record: "public",
    files: "restricted",
    embargo: {
      active: true,
      until: zenodoFileEmbargoUntilDate(days, from),
    },
  };
}

export function formatZenodoFileEmbargoUntilLabel(untilDate: string): string {
  const parsed = Date.parse(`${untilDate}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return untilDate;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

/** Instant (UTC) when embargoed files become downloadable (start of `untilDate`). */
export function zenodoFileEmbargoReleaseInstant(
  untilDate: string,
): Date | null {
  const normalized = untilDate.trim().slice(0, 10);
  const releaseMs = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(releaseMs) ? new Date(releaseMs) : null;
}

/** True while Zenodo files are still restricted (before `untilDate` UTC). */
export function isZenodoFileEmbargoActive(
  untilDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const release = untilDate ? zenodoFileEmbargoReleaseInstant(untilDate) : null;
  if (!release) return false;
  return now.getTime() < release.getTime();
}

/** Short label for dashboard cards (e.g. "Files unrestricted in 3 days"). */
export function formatZenodoFileEmbargoTimeRemaining(
  untilDate: string,
  now: Date = new Date(),
): string {
  const release = zenodoFileEmbargoReleaseInstant(untilDate);
  if (!release) return "";
  const ms = release.getTime() - now.getTime();
  if (ms <= 0) return "Files are now unrestricted on Zenodo";
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.ceil(ms / dayMs);
  if (days > 1) return `Files unrestricted in ${days} days`;
  if (days === 1) return "Files unrestricted in 1 day";
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours > 1) return `Files unrestricted in ${hours} hours`;
  const minutes = Math.max(1, Math.ceil(ms / (60 * 1000)));
  return `Files unrestricted in ${minutes} minutes`;
}
