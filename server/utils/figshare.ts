import {
  createFigshareClient,
  figshareFetch,
  FigshareApiError,
  type FigshareAccount,
} from "./figshareClient";
import {
  decryptFigshareToken,
  encryptFigshareToken,
  isFigshareTokenEncryptionConfigured,
} from "./figshareTokenCrypto";

/**
 * Figshare connections: OAuth sign-in and personal tokens, stored encrypted in
 * FigshareToken, one per user. Mirrors the Zenodo connection (zenodo.ts):
 *
 * - An OAuth token is refreshed shortly before it expires.
 * - A personal token is deleted an hour after it is connected, because it
 *   never expires on Figshare and grants full access to the account.
 * - A token Figshare rejects is deleted so the UI offers to connect again.
 * - Tokens never appear in logs, responses or errors.
 */

// A personal token is kept for an hour, the same limit as Zenodo's.
export const FIGSHARE_PERSONAL_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

// Refresh an OAuth token this long before it expires, so a publish that takes
// a minute never runs into the expiry halfway through.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function figshareConfig() {
  const config = useRuntimeConfig();

  return {
    endpoint: (config.figshareEndpoint || "https://figshare.com").replace(
      /\/+$/,
      "",
    ),
    apiEndpoint: (
      config.figshareApiEndpoint || "https://api.figshare.com/v2"
    ).replace(/\/+$/, ""),
    clientId: config.figshareClientId,
    clientSecret: config.figshareClientSecret,
    redirectUri: config.figshareRedirectUri,
  };
}

/** Figshare can be used at all: an API address and a token encryption key. */
export function isFigshareConfigured() {
  return (
    !!figshareConfig().apiEndpoint && isFigshareTokenEncryptionConfigured()
  );
}

/**
 * Publish runs stop at a private draft: everywhere but production, unless
 * NUXT_FIGSHARE_ALLOW_PUBLISH is set. Figshare has no sandbox, and an item
 * published by mistake can only be taken down by Figshare support.
 */
export function isFigshareDraftOnly() {
  const config = useRuntimeConfig();
  const siteEnv = config.siteEnv || config.public.siteEnv;
  const allowPublish =
    config.figshareAllowPublish === true ||
    String(config.figshareAllowPublish) === "true";

  return siteEnv !== "production" && !allowPublish;
}

/** The Sign in with Figshare button can be offered. */
export function isFigshareOAuthConfigured() {
  const { clientId, clientSecret, redirectUri } = figshareConfig();

  return (
    isFigshareConfigured() && !!clientId && !!clientSecret && !!redirectUri
  );
}

export function figshareWebEndpoint() {
  return figshareConfig().endpoint;
}

/** Where users create a personal token. */
export function figshareApplicationsUrl() {
  return `${figshareConfig().endpoint}/account/applications`;
}

export function figshareAuthorizeUrl(state: string) {
  const { endpoint, clientId, redirectUri } = figshareConfig();
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "all",
    state,
    redirect_uri: redirectUri,
  });

  return `${endpoint}/account/applications/authorize?${query.toString()}`;
}

export function figshareClientFor(token: string) {
  return createFigshareClient({
    token,
    apiBase: figshareConfig().apiEndpoint,
  });
}

type OAuthTokenBody = {
  access_token?: string;
  token?: string;
  refresh_token?: string;
  expires_in?: number;
};

async function requestFigshareToken(params: Record<string, string>) {
  const { apiEndpoint, clientId, clientSecret } = figshareConfig();
  // Figshare's token endpoint takes form or JSON bodies and always answers
  // 200 or 400 (docs.figshare.com, "Token endpoint").
  const response = await figshareFetch(`${apiEndpoint}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...params,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    // The body names the OAuth error (invalid_grant and so on) and carries no
    // token, so a short slice is safe to log.
    const body = await response.text().catch(() => "");

    console.error(
      `[Figshare] Token request (${params.grant_type}) failed: ${response.status} ${body.replace(/\s+/g, " ").slice(0, 200)}`,
    );

    return null;
  }

  const body = (await response.json().catch(() => null)) as OAuthTokenBody;
  const accessToken = body?.access_token ?? body?.token;

  if (!accessToken) return null;

  return {
    accessToken,
    refreshToken: body.refresh_token ?? null,
    expiresIn: Number.isFinite(body.expires_in) ? body.expires_in! : null,
  };
}

async function storeOAuthToken(
  userId: string,
  token: {
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number | null;
  },
) {
  const data = {
    tokenType: "oauth",
    accessToken: encryptFigshareToken(token.accessToken, userId, "accessToken"),
    refreshToken: token.refreshToken
      ? encryptFigshareToken(token.refreshToken, userId, "refreshToken")
      : null,
    expiresAt: token.expiresIn
      ? new Date(Date.now() + token.expiresIn * 1000)
      : null,
  };

  await prisma.figshareToken.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

/** Trades the code from the OAuth redirect for a token and stores it. */
export async function exchangeFigshareCode(userId: string, code: string) {
  // The authorize request sent redirect_uri, so the token request repeats it
  // (RFC 6749 4.1.3). Figshare's docs don't list it here, but servers that
  // check it need it, and ones that don't ignore it.
  const token = await requestFigshareToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: figshareConfig().redirectUri,
  });

  if (!token) return false;

  await storeOAuthToken(userId, token);
  console.log("[Figshare] OAuth token stored");

  return true;
}

async function deleteFigshareToken(userId: string) {
  await prisma.figshareToken.deleteMany({ where: { userId } });
}

export async function disconnectFigshare(userId: string) {
  await deleteFigshareToken(userId);
}

/**
 * The usable access token for the user, refreshing an OAuth token that is
 * about to expire. Null with a reason when there is none.
 */
export async function getFigshareAccessToken(userId: string): Promise<
  | { token: string; tokenType: string; expiresAt: Date | null }
  | {
      token: null;
      reason: "none" | "personal-expired" | "expired";
    }
> {
  const row = await prisma.figshareToken.findUnique({ where: { userId } });

  if (!row) return { token: null, reason: "none" };

  const now = Date.now();

  if (row.tokenType === "personal") {
    if (row.expiresAt && row.expiresAt.getTime() <= now) {
      await prisma.figshareToken.deleteMany({
        where: {
          userId,
          tokenType: "personal",
          expiresAt: { lte: new Date() },
        },
      });

      return { token: null, reason: "personal-expired" };
    }

    const token = decryptFigshareToken(row.accessToken, userId, "accessToken");

    if (!token) {
      console.error("[Figshare] Stored token could not be decrypted");
      await deleteFigshareToken(userId);

      return { token: null, reason: "none" };
    }

    return { token, tokenType: "personal", expiresAt: row.expiresAt };
  }

  const accessToken = decryptFigshareToken(
    row.accessToken,
    userId,
    "accessToken",
  );

  if (!accessToken) {
    console.error("[Figshare] Stored token could not be decrypted");
    await deleteFigshareToken(userId);

    return { token: null, reason: "none" };
  }

  const expiresAt = row.expiresAt?.getTime();
  const needsRefresh =
    expiresAt !== undefined && expiresAt - now < REFRESH_MARGIN_MS;

  if (!needsRefresh) {
    return { token: accessToken, tokenType: "oauth", expiresAt: row.expiresAt };
  }

  const refreshToken = row.refreshToken
    ? decryptFigshareToken(row.refreshToken, userId, "refreshToken")
    : null;
  const refreshed =
    refreshToken && isFigshareOAuthConfigured()
      ? await requestFigshareToken({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        })
      : null;

  if (refreshed) {
    // Figshare may not rotate the refresh token; keep the old one then.
    await storeOAuthToken(userId, {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? refreshToken,
    });
    console.log("[Figshare] OAuth token refreshed");

    return {
      token: refreshed.accessToken,
      tokenType: "oauth",
      expiresAt: refreshed.expiresIn
        ? new Date(Date.now() + refreshed.expiresIn * 1000)
        : null,
    };
  }

  // Not refreshed but not expired yet: it still works until expiresAt.
  if (expiresAt !== undefined && expiresAt > now) {
    return { token: accessToken, tokenType: "oauth", expiresAt: row.expiresAt };
  }

  await deleteFigshareToken(userId);

  return { token: null, reason: "expired" };
}

export type FigshareConnectionStatus = {
  connected: boolean;
  tokenType?: string;
  expiresAt?: string | null;
  account?: {
    name: string;
    email?: string;
    orcid?: string;
    institutional: boolean;
  };
  message?: string;
  personalTokenExpired?: boolean;
};

function accountName(account: FigshareAccount) {
  return (
    [account.first_name, account.last_name].filter(Boolean).join(" ").trim() ||
    account.email ||
    `Figshare account ${account.id}`
  );
}

/**
 * Checks the stored connection against Figshare. A token Figshare rejects is
 * deleted. A Figshare outage keeps the token and says so.
 */
export async function getFigshareConnectionStatus(userId: string): Promise<
  FigshareConnectionStatus & {
    token?: string;
    rawAccount?: FigshareAccount;
  }
> {
  const stored = await getFigshareAccessToken(userId);

  if (stored.token === null) {
    if (stored.reason === "personal-expired") {
      return {
        connected: false,
        personalTokenExpired: true,
        message:
          "We deleted your personal token because it was connected over an hour ago. Create a new token on Figshare and connect again.",
      };
    }

    if (stored.reason === "expired") {
      return {
        connected: false,
        message:
          "Your Figshare connection has expired. Sign in to Figshare again to continue.",
      };
    }

    return { connected: false };
  }

  try {
    const account = await figshareClientFor(stored.token).account();

    return {
      connected: true,
      tokenType: stored.tokenType,
      expiresAt: stored.expiresAt?.toISOString() ?? null,
      account: {
        name: accountName(account),
        ...(account.email && { email: account.email }),
        ...(account.orcid_id && { orcid: account.orcid_id }),
        institutional: !!account.institution_id,
      },
      token: stored.token,
      rawAccount: account,
    };
  } catch (error) {
    if (error instanceof FigshareApiError && error.isTokenRejection) {
      console.log(
        `[Figshare] Token rejected (status: ${error.status}), deleting it`,
      );
      await deleteFigshareToken(userId);

      return {
        connected: false,
        message:
          stored.tokenType === "personal"
            ? "Figshare no longer accepts your personal token. It may have been deleted on Figshare. Create a new token and connect again."
            : "Figshare no longer accepts this connection. Sign in to Figshare again to continue.",
      };
    }

    console.warn(
      `[Figshare] Connection check failed, keeping the token: ${error instanceof Error ? error.message : error}`,
    );

    return {
      connected: false,
      message: "We couldn't reach Figshare. Please try again in a few minutes.",
    };
  }
}

export type FigsharePersonalTokenResult =
  | "connected"
  | "rejected"
  | "unavailable";

/**
 * Checks a personal token the user pasted in and stores it, encrypted, once
 * Figshare accepts it. Replaces any earlier connection.
 */
export async function connectFigsharePersonalToken(
  userId: string,
  token: string,
): Promise<FigsharePersonalTokenResult> {
  try {
    await createFigshareClient({
      token,
      apiBase: figshareConfig().apiEndpoint,
      retries: 0,
      timeoutMs: 15_000,
    }).account();
  } catch (error) {
    if (error instanceof FigshareApiError && error.isTokenRejection) {
      console.log(
        `[Figshare] Personal token rejected (status: ${error.status}), not stored`,
      );

      return "rejected";
    }

    console.warn(
      `[Figshare] Personal token check failed, not stored: ${error instanceof Error ? error.message : error}`,
    );

    return "unavailable";
  }

  const data = {
    tokenType: "personal",
    accessToken: encryptFigshareToken(token, userId, "accessToken"),
    refreshToken: null,
    expiresAt: new Date(Date.now() + FIGSHARE_PERSONAL_TOKEN_LIFETIME_MS),
  };

  await prisma.figshareToken.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  console.log("[Figshare] Personal token accepted and stored");

  return "connected";
}

/** Deletes every personal token connected over an hour ago. */
export async function purgeExpiredFigsharePersonalTokens() {
  const { count } = await prisma.figshareToken.deleteMany({
    where: { tokenType: "personal", expiresAt: { lte: new Date() } },
  });

  if (count > 0) {
    console.log(`[Figshare] Deleted ${count} expired personal token(s)`);
  }

  return count;
}
