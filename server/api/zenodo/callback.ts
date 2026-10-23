const config = useRuntimeConfig();

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const { user } = session;
  const userId = user.id;
  const query = getQuery(event);

  const { code, state } = query;

  if (!code || typeof code !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid authorization code",
    });
  }

  if (!state || typeof state !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid state parameter",
    });
  }

  const bulkImportReturn =
    typeof state === "string" && state.startsWith("bulk-import:")
      ? state.slice("bulk-import:".length)
      : null;
  const posterId = state;
  const {
    zenodoClientId: clientId,
    zenodoClientSecret: clientSecret,
    zenodoRedirectUri: redirectUri,
    zenodoEndpoint,
  } = config;

  if (!clientId || !clientSecret || !redirectUri || !zenodoEndpoint) {
    throw createError({
      statusCode: 500,
      statusMessage: "Zenodo OAuth configuration is missing",
    });
  }

  const urlEncoded = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const oauthTokenResponse = await fetch(`${zenodoEndpoint}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: urlEncoded.toString(),
  });

  if (!oauthTokenResponse.ok) {
    const errorBody = await oauthTokenResponse.text();
    console.error(
      `[Zenodo] Token exchange failed (${oauthTokenResponse.status}):`,
      errorBody,
    );

    if (bulkImportReturn) {
      const params = new URLSearchParams({
        jobId: bulkImportReturn,
        bulkWizardStep: "publish",
      });
      return sendRedirect(
        event,
        `/zenodo-auth-error?${params.toString()}`,
      );
    }

    return sendRedirect(
      event,
      `/zenodo-auth-error?posterId=${encodeURIComponent(String(state))}`,
    );
  }

  console.log("Zenodo OAuth token obtained successfully");

  const { access_token, refresh_token, expires_in } =
    await oauthTokenResponse.json();

  // Upsert the token in the database
  await prisma.zenodoToken.upsert({
    where: {
      userId,
    },
    update: {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
    },
    create: {
      userId,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
    },
  });

  if (bulkImportReturn) {
    const params = new URLSearchParams({
      jobId: bulkImportReturn,
      bulkWizardStep: "publish",
      repository: "zenodo",
    });
    return sendRedirect(event, `/share/new-bulk?${params.toString()}`);
  }

  return sendRedirect(event, `/share/${posterId}/publish?repository=zenodo`);
});
