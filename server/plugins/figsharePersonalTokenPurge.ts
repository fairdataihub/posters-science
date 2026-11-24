// Personal tokens are deleted an hour after they are connected.
// getFigshareAccessToken deletes an expired one when its user comes back, and
// this sweep removes the rest, so a token is never kept for a user who leaves.
const PURGE_INTERVAL_MS = 60 * 1000;

export default defineNitroPlugin(() => {
  // The prerender build has no use for it and should not touch the database
  if (import.meta.prerender) return;

  const purge = () =>
    purgeExpiredFigsharePersonalTokens().catch((error: unknown) => {
      console.error(
        "[Figshare] Deleting expired personal tokens failed:",
        error instanceof Error ? error.message : error,
      );
    });

  purge();

  // unref so the timer never keeps the process alive on shutdown
  setInterval(purge, PURGE_INTERVAL_MS).unref();
});
