// FEATURE FLAG (versioning): Once versioning is live, we will delete this file.
export function useVersioningEnabled() {
  return useRuntimeConfig().public.versioningEnabled === true;
}
