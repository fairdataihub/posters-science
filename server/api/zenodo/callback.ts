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

    return sendRedirect(
      event,
      `/zenodo-auth-error?posterId=${encodeURIComponent(posterId)}`,
    );
  }

  console.log("Zenodo OAuth token obtained successfully");

  const { access_token, refresh_token, expires_in } =
    await oauthTokenResponse.json();

  // Upsert the token in the database, encrypted at rest
  const storedToken = {
    tokenType: "oauth",
    accessToken: encryptZenodoToken(access_token, userId, "accessToken"),
    refreshToken: encryptZenodoToken(refresh_token, userId, "refreshToken"),
    expiresAt: new Date(Date.now() + expires_in * 1000),
  };

  await prisma.zenodoToken.upsert({
    where: {
      userId,
    },
    update: storedToken,
    create: {
      userId,
      ...storedToken,
    },
  });

  // Redirect back to the review page with zenodo pre-selected
  return sendRedirect(event, `/share/${posterId}/publish?repository=zenodo`);
});
