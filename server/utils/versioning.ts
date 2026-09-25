// FEATURE FLAG (versioning): delete this file once user versioning is live everywhere.
export function assertVersioningEnabled() {
  if (useRuntimeConfig().public.versioningEnabled !== true) {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }
}
