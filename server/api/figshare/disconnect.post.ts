// Deletes the app's copy of the user's Figshare token. It does not revoke the
// token at Figshare; users do that on their Figshare applications page.
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  await disconnectFigshare(session.user.id);

  return { success: true };
});
