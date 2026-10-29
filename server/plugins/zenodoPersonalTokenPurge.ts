// Personal access tokens are deleted an hour after they are connected.
// validateZenodoToken deletes an expired one when its user comes back, and
// this sweep removes the rest, so a token is never kept for a user who leaves.
// Running it on every instance during a deploy is harmless, deleteMany is
// idempotent.
const PURGE_INTERVAL_MS = 60 * 1000;

export default defineNitroPlugin(() => {
  // The prerender build has no use for it and should not touch the database
  if (import.meta.prerender) return;

  const purge = () =>
    purgeExpiredZenodoPersonalTokens().catch((error: unknown) => {
      console.error(
        "[Zenodo] Deleting expired personal access tokens failed:",
        error instanceof Error ? error.message : error,
      );
    });

  purge();

  // unref so the timer never keeps the process alive on shutdown
  setInterval(purge, PURGE_INTERVAL_MS).unref();
});
