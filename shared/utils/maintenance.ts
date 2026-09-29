// Runtime maintenance switches. These live in
// the database so an admin can pause a workflow from /admin without a redeploy.

export const MAINTENANCE_KEYS = ["extraction", "zenodo", "versioning"] as const;

export type MaintenanceKey = (typeof MAINTENANCE_KEYS)[number];

export const MAINTENANCE_LABELS: Record<MaintenanceKey, string> = {
  extraction: "Poster uploads and metadata extraction",
  zenodo: "Zenodo publication",
  versioning: "New poster versions",
};

export const MAINTENANCE_DESCRIPTIONS: Record<MaintenanceKey, string> = {
  extraction:
    "Anything that needs the extraction service: new uploads, thumbnail generation, extraction retries, and version drafts that re-extract metadata.",
  zenodo:
    "Archiving a poster to Zenodo. The Zenodo option is removed from the repository picker, so users cannot even start signing in.",
  versioning:
    "Starting a new version of a published poster, whether it copies or re-extracts metadata. Drafts already in progress stay editable.",
};

/**
 * What each switch blocks that another switch also blocks. Shown in the admin
 * panel so the overlap between extraction and versioning is not a surprise.
 */
export const MAINTENANCE_OVERLAPS: Partial<Record<MaintenanceKey, string>> = {
  extraction:
    "Also stops version drafts that re-extract metadata. Copying metadata into a new version still works unless new poster versions is paused too.",
  versioning:
    "Covers both metadata modes, so it stops re-extract drafts whether or not uploads and extraction is paused.",
};

export const MAINTENANCE_FALLBACK_MESSAGES: Record<MaintenanceKey, string> = {
  extraction:
    "Poster uploads are paused for maintenance. Please try again shortly.",
  zenodo:
    "Publishing to Zenodo is paused for maintenance. Please try again shortly.",
  versioning:
    "Editing published posters is paused for maintenance. Please try again shortly.",
};

export function isMaintenanceKey(value: unknown): value is MaintenanceKey {
  return (
    typeof value === "string" &&
    (MAINTENANCE_KEYS as readonly string[]).includes(value)
  );
}

/** Falls back to a sensible default when an admin leaves the message blank. */
export function resolveMaintenanceMessage(
  key: MaintenanceKey,
  message?: string | null,
): string {
  const trimmed = message?.trim();

  return trimmed ? trimmed : MAINTENANCE_FALLBACK_MESSAGES[key];
}

export type ActiveMaintenance = {
  key: MaintenanceKey;
  message: string;
  since: string | null;
};
