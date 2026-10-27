// Zenodo tokens stored before encryption was added are still plain text. They
// are encrypted once this instance serves its first real request, not at boot:
// during a deploy the previous version keeps serving until this one passes its
// /up health check, and it would send an encrypted value to Zenodo as the
// token, get a 401 and delete that user's connection.
export default defineNitroPlugin((nitroApp) => {
  let started = false;

  nitroApp.hooks.hook("request", (event) => {
    if (started || event.path === "/up") return;

    started = true;

    // The next boot tries again if this fails
    encryptLegacyZenodoTokens().catch((error: unknown) => {
      console.error(
        "[Zenodo] Encrypting stored plain text tokens failed:",
        error instanceof Error ? error.message : error,
      );
    });
  });
});
