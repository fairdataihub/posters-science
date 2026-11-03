// Register feature names here before enabling them in NUXT_FEATURES.
export const FEATURE_NAMES = ["bulk_extraction"] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureFlags = Record<FeatureName, boolean>;

export function resolveFeatureFlags(value: string): FeatureFlags {
  value = value.trim() === "none" ? "" : value;
  const enabled = new Set(
    value
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );

  for (const name of enabled) {
    if (!(FEATURE_NAMES as readonly string[]).includes(name)) {
      throw new Error(`Unknown feature: ${name}`);
    }
  }

  return Object.fromEntries(
    FEATURE_NAMES.map((name) => [name, enabled.has(name)]),
  ) as FeatureFlags;
}
