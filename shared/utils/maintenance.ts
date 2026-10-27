// Runtime maintenance switches. These live in
// the database so an admin can pause a workflow from /admin without a redeploy.

export const MAINTENANCE_KEYS = [
  "extraction",
  "zenodoOAuth",
  "zenodoToken",
  "versioning",
] as const;

export type MaintenanceKey = (typeof MAINTENANCE_KEYS)[number];

export const MAINTENANCE_LABELS: Record<MaintenanceKey, string> = {
  extraction: "Poster uploads and metadata extraction",
  zenodoOAuth: "Zenodo OAuth sign-in",
  zenodoToken: "Zenodo personal access token sign-in",
  versioning: "New poster versions",
};

export const MAINTENANCE_DESCRIPTIONS: Record<MaintenanceKey, string> = {
  extraction:
    "Anything that needs the extraction service: new uploads, thumbnail generation, extraction retries, and version drafts that re-extract metadata.",
  zenodoOAuth: "The Sign in to Zenodo button.",
  zenodoToken: "Connecting Zenodo by pasting a personal access token.",
  versioning:
    "Starting a new version of a published poster, whether it copies or re-extracts metadata. Drafts already in progress stay editable.",
};

/**
 * What each switch blocks that another switch also blocks. Shown in the admin
 * panel so overlaps like extraction and versioning are not a surprise.
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
  // Shown above the personal access token form, which explains what to do next.
  zenodoOAuth: "Signing in with your Zenodo account is paused for maintenance.",
  zenodoToken:
    "Connecting Zenodo with a personal access token is paused for maintenance. Please try again shortly.",
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
  // True when the admin left the message blank and `message` is the default.
  usesDefaultMessage: boolean;
  since: string | null;
};

/*
 * Zenodo publishing has no switch of its own. Users connect their Zenodo
 * account with OAuth sign-in or a personal access token, each with a switch,
 * and pausing both turns Zenodo off: nobody can connect or publish, including
 * users who are already connected. The admin panel edits the pair as one card
 * with these four modes, and users see at most one notice for them.
 */
export const ZENODO_SIGN_IN_KEYS = [
  "zenodoOAuth",
  "zenodoToken",
] as const satisfies readonly MaintenanceKey[];

export type ZenodoSignInKey = (typeof ZENODO_SIGN_IN_KEYS)[number];

export function isZenodoSignInKey(value: string): value is ZenodoSignInKey {
  return (ZENODO_SIGN_IN_KEYS as readonly string[]).includes(value);
}

export const ZENODO_MODES = [
  "live",
  "oauthPaused",
  "tokenPaused",
  "off",
] as const;

export type ZenodoMode = (typeof ZENODO_MODES)[number];

export function zenodoModeFor(
  paused: Record<ZenodoSignInKey, boolean>,
): ZenodoMode {
  if (paused.zenodoOAuth && paused.zenodoToken) return "off";
  if (paused.zenodoOAuth) return "oauthPaused";
  if (paused.zenodoToken) return "tokenPaused";

  return "live";
}

export function zenodoSwitchesFor(
  mode: ZenodoMode,
): Record<ZenodoSignInKey, boolean> {
  return {
    zenodoOAuth: mode === "oauthPaused" || mode === "off",
    zenodoToken: mode === "tokenPaused" || mode === "off",
  };
}

export const ZENODO_MODE_LABELS: Record<ZenodoMode, string> = {
  live: "Live",
  oauthPaused: "OAuth paused",
  tokenPaused: "Tokens paused",
  off: "Off",
};

export const ZENODO_MODE_DESCRIPTIONS: Record<ZenodoMode, string> = {
  live: "Users connect with the Sign in to Zenodo button or a personal access token.",
  oauthPaused:
    "Users connect with a personal access token only. Use this when Zenodo's OAuth is failing.",
  tokenPaused: "Users connect with the Sign in to Zenodo button only.",
  off: "Nobody can connect or publish to Zenodo, including users who are already connected.",
};

/** Title of the one notice users see while Zenodo is off. */
export const ZENODO_OFF_LABEL = "Zenodo publication";

export const ZENODO_OFF_FALLBACK_MESSAGE =
  "Publishing to Zenodo is paused for maintenance. Please try again shortly.";

export type ZenodoMaintenance = {
  mode: ZenodoMode;
  /** The notice to show while Zenodo is off, null in every other mode. */
  off: { message: string; since: string | null } | null;
};

export function resolveZenodoMaintenance(
  active: readonly ActiveMaintenance[],
): ZenodoMaintenance {
  const oauth = active.find((entry) => entry.key === "zenodoOAuth");
  const token = active.find((entry) => entry.key === "zenodoToken");
  const mode = zenodoModeFor({ zenodoOAuth: !!oauth, zenodoToken: !!token });

  if (!oauth || !token) return { mode, off: null };

  // The admin panel saves one message on both rows. Each row's default speaks
  // for a single way of connecting, so a blank message gets the off default.
  const custom = [oauth, token].find((entry) => !entry.usesDefaultMessage);
  // Zenodo went off when the second switch was paused.
  const since =
    [oauth.since, token.since]
      .filter((value) => value !== null)
      .sort()
      .at(-1) ?? null;

  return {
    mode,
    off: { message: custom?.message ?? ZENODO_OFF_FALLBACK_MESSAGE, since },
  };
}
