import type { H3Event } from "h3";
import { z } from "zod";
import { isValidOrcidChecksum } from "#shared/utils/orcid";
import { normalizeOrcid } from "#shared/utils/discoverSearch";
import { safeRedirectPath } from "#shared/utils/redirect";
import type { OrcidIntent, OrcidOutcome } from "#shared/utils/orcidSignIn";
import { isUniqueConstraintError } from "../../../utils/claims";
import { logwatch } from "../../../utils/logwatch";
import { isUnderMaintenance } from "../../../utils/maintenance";
import {
  clearOrcidFlow,
  fetchOrcidPublicEmail,
  isDevSite,
  orcidOutcomePath,
  orcidSignInConfig,
  readOrcidFlow,
  startOrcidFlow,
  updateOrcidFlow,
  withOrcidOutcome,
  type OrcidFlow,
} from "../../../utils/orcidSignIn";

/**
 * Sign in with ORCID, and link ORCID from Settings. One route handles both legs
 * of the round trip: without `code` it sends the person to ORCID, and ORCID
 * sends them back here with `code`, or with `error` when they cancel.
 *
 * Query on the way out: intent (signin | link), redirect, and email when the
 * visit came from an organization invite.
 */
export default defineEventHandler(async (event) => {
  const config = orcidSignInConfig();
  const query = getQuery(event);
  const returning = query.code !== undefined || query.error !== undefined;

  if (!returning) {
    const intent: OrcidIntent = query.intent === "link" ? "link" : "signin";

    if (!config) return sendOutcome(event, intent, "unavailable");

    if (await isUnderMaintenance("orcidSignIn")) {
      return sendOutcome(event, intent, "paused");
    }

    const { user } = await getUserSession(event);

    if (intent === "link" && !user) {
      return sendRedirect(
        event,
        `/login?redirect=${encodeURIComponent("/profile#orcid")}`,
      );
    }

    if (intent === "signin" && user) {
      return sendRedirect(event, safeRedirectPath(query.redirect));
    }

    const inviteEmail = z.email().safeParse(query.email).data;

    await startOrcidFlow(event, {
      intent,
      userId: user?.id,
      redirect: safeRedirectPath(
        query.redirect,
        intent === "link" ? "/profile" : "/dashboard",
      ),
      inviteEmail: inviteEmail?.trim().toLowerCase(),
    });
  } else if (!config) {
    return sendOutcome(event, "signin", "unavailable");
  }

  const { clientId, clientSecret, redirectUri, endpoint } = config!;

  // Built per request so the settings can change without a redeploy. The
  // endpoints are given directly to skip a discovery fetch on every sign in.
  const handler = defineOAuthOidcEventHandler({
    config: {
      clientId,
      clientSecret,
      redirectURL: redirectUri,
      openidConfig: {
        authorization_endpoint: `${endpoint}/oauth/authorize`,
        token_endpoint: `${endpoint}/oauth/token`,
        userinfo_endpoint: `${endpoint}/oauth/userinfo`,
      },
    },
    onSuccess: (event, { user, tokens }) =>
      completeOrcidSignIn(event, {
        // ORCID also puts the iD in the token response.
        orcid: String(user?.sub ?? (tokens as { orcid?: string }).orcid ?? ""),
        givenName: typeof user?.given_name === "string" ? user.given_name : "",
        familyName:
          typeof user?.family_name === "string" ? user.family_name : "",
      }),
    onError: (event, error) => failOrcidSignIn(event, error),
  });

  try {
    return await handler(event);
  } catch (error) {
    // A token request that fails with anything but a 401 throws.
    return failOrcidSignIn(event, error);
  }
});

function sendOutcome(
  event: H3Event,
  intent: OrcidIntent,
  outcome: OrcidOutcome,
  redirect?: string,
) {
  return sendRedirect(event, orcidOutcomePath(intent, outcome, redirect));
}

async function failOrcidSignIn(event: H3Event, error: unknown) {
  const flow = await readOrcidFlow(event);
  const intent = flow?.intent ?? "signin";
  const message = error instanceof Error ? error.message : String(error);
  const data = (error as { data?: { error?: unknown } } | null)?.data;

  let outcome: OrcidOutcome = "error";

  if (data?.error === "access_denied") outcome = "cancelled";
  // The state cookie lasts ten minutes, so a slow return looks like this.
  else if (message.includes("state mismatch")) outcome = "expired";

  const entry = {
    action: "auth.orcid",
    message: `ORCID ${intent === "link" ? "link" : "sign in"} did not complete`,
    intent,
    outcome,
    userId: flow?.userId,
    error: message,
  };

  // A cancel or timeout is normal; anything else may be a setup problem.
  if (outcome === "error") logwatch.warn(entry);
  else logwatch.info(entry);

  await clearOrcidFlow(event);

  return sendOutcome(event, intent, outcome, flow?.redirect);
}

async function completeOrcidSignIn(
  event: H3Event,
  identity: { orcid: string; givenName: string; familyName: string },
) {
  const flow = await readOrcidFlow(event);

  if (!flow) {
    logwatch.info({
      action: "auth.orcid",
      message: "ORCID sent someone back without a sign-in in progress",
      outcome: "expired",
    });

    return sendOutcome(event, "signin", "expired");
  }

  const orcid = normalizeOrcid(identity.orcid);

  if (!isValidOrcidChecksum(orcid)) {
    return failOrcidSignIn(
      event,
      new Error(`ORCID returned an iD that is not valid: ${identity.orcid}`),
    );
  }

  if (flow.intent === "link") return linkOrcid(event, flow, orcid);

  return signInWithOrcid(event, flow, { ...identity, orcid });
}

async function linkOrcid(event: H3Event, flow: OrcidFlow, orcid: string) {
  const { user } = await getUserSession(event);

  // Signed out or switched accounts while at ORCID.
  if (!user || user.id !== flow.userId) {
    await clearOrcidFlow(event);

    return sendOutcome(event, "link", "expired");
  }

  const outcome = await createLink(user.id, orcid);

  logwatch.info({
    action: outcome === "linked" ? "user.orcid.link" : "auth.orcid",
    message:
      outcome === "linked"
        ? "ORCID iD linked"
        : "ORCID iD not linked because of an existing link",
    intent: "link",
    outcome,
    userId: user.id,
    orcid,
  });

  await clearOrcidFlow(event);

  return sendOutcome(event, "link", outcome);
}

async function createLink(
  userId: string,
  orcid: string,
): Promise<"linked" | "taken" | "already"> {
  const check = async () => {
    const [byOrcid, byUser] = await Promise.all([
      prisma.linkedAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "orcid",
            providerAccountId: orcid,
          },
        },
        select: { userId: true },
      }),
      prisma.linkedAccount.findUnique({
        where: { userId_provider: { userId, provider: "orcid" } },
        select: { providerAccountId: true },
      }),
    ]);

    if (byOrcid) return byOrcid.userId === userId ? "linked" : "taken";
    if (byUser) return "already";

    return null;
  };

  const existing = await check();

  if (existing) return existing;

  try {
    await prisma.linkedAccount.create({
      data: { userId, provider: "orcid", providerAccountId: orcid },
    });

    return "linked";
  } catch (error) {
    // Another request linked first.
    if (isUniqueConstraintError(error)) return (await check()) ?? "taken";

    throw error;
  }
}

async function signInWithOrcid(
  event: H3Event,
  flow: OrcidFlow,
  identity: { orcid: string; givenName: string; familyName: string },
) {
  const { orcid } = identity;
  const account = await prisma.linkedAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "orcid",
        providerAccountId: orcid,
      },
    },
    include: { user: true },
  });

  if (account) {
    const { user } = account;

    // Same rule as the password login: the email must be verified first.
    if (!user.emailVerified && !isDevSite()) {
      await updateOrcidFlow(event, {
        stage: "unverified",
        orcid,
        pendingUserId: user.id,
      });

      logwatch.info({
        action: "auth.orcid",
        message: "ORCID sign in refused because the email is not verified",
        intent: "signin",
        outcome: "unverified",
        userId: user.id,
      });

      return sendOutcome(event, "signin", "unverified", flow.redirect);
    }

    await createUserSession(event, user);
    await clearOrcidFlow(event);

    logwatch.info({
      action: "auth.orcid",
      message: "Signed in with ORCID",
      intent: "signin",
      outcome: "signedin",
      userId: user.id,
    });

    return sendRedirect(event, withOrcidOutcome(flow.redirect, "signedin"));
  }

  // A new person: they finish signing up with an email address.
  const publicEmail = await fetchOrcidPublicEmail(orcid);

  await updateOrcidFlow(event, {
    stage: "signup",
    orcid,
    givenName: identity.givenName.trim(),
    familyName: identity.familyName.trim(),
    orcidEmail: publicEmail?.email,
    orcidEmailVerified: publicEmail?.verified ?? false,
  });

  logwatch.info({
    action: "auth.orcid",
    message: "ORCID iD has no account yet, sent to finish signing up",
    intent: "signin",
    outcome: "signup",
    hasPublicEmail: Boolean(publicEmail),
  });

  return sendRedirect(event, "/signup/orcid");
}
