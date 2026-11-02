import type { H3Event } from "h3";
import { resolveFeatureFlags, type FeatureName } from "#shared/utils/features";

export function getFeatureFlags(event?: H3Event) {
  return resolveFeatureFlags(useRuntimeConfig(event).features);
}

export function requireFeature(name: FeatureName, event?: H3Event) {
  if (!getFeatureFlags(event)[name]) {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }
}
