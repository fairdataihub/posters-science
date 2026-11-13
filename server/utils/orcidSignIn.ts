import type { H3Event, SessionConfig } from "h3";
import { clearSession, getCookie, getSession, updateSession } from "h3";
import { z } from "zod";
import {
  ORCID_FLOW_TTL_SECONDS,
  type OrcidIntent,
  type OrcidOutcome,
} from "#shared/utils/orcidSignIn";
import { logwatch } from "./logwatch";

const FLOW_COOKIE = "ps-orcid-flow";

// Some sites refuse Node's default User-Agent, so say who we are.
const USER_AGENT = "Posters.science (+https://posters.science)";

/**
 * ORCID settings, or null when any is missing. Then the Sign in with ORCID
 * button is hidden and the route refuses to start.
 */
export function orcidSignInConfig() {
  const { orcidClientId, orcidClientSecret, orcidRedirectUri, orcidEndpoint } =
    useRuntimeConfig();

  if (
    !orcidClientId ||
    !orcidClientSecret ||
    !orcidRedirectUri ||
    !orcidEndpoint
  ) {
    return null;
  }

  // https://orcid.org or https://sandbox.orcid.org
  const endpoint = orcidEndpoint.replace(/\/+$/, "");

  return {
    clientId: orcidClientId,
    clientSecret: orcidClientSecret,
    redirectUri: orcidRedirectUri,
    endpoint,
    // pub.orcid.org or pub.sandbox.orcid.org
    publicApi: endpoint.replace("://", "://pub."),
  };
}

/** Dev and local sites skip email verification, like password signups. */
export function isDevSite() {
  const config = useRuntimeConfig();
  const siteEnv = config.siteEnv || config.public.siteEnv;

  return siteEnv === "development" || siteEnv === "dev";
}

/**
 * One ORCID attempt, kept in a sealed cookie so the browser can't change it.
 * It carries what the round trip to ORCID can't: whether this is a sign in or
 * a link, and where to go afterwards. After ORCID it holds the confirmed iD
 * until the person finishes signing up.
 */
export type OrcidFlow = {
  intent: OrcidIntent;
  // link: the signed-in account the iD is being added to.
  userId?: string;
  redirect: string;
  // Prefill for the finish sign-up form when the visit came from an invite.
  inviteEmail?: string;
  // Set when ORCID sends the person back.
  stage?: "signup" | "unverified";
  orcid?: string;
  givenName?: string;
  familyName?: string;
  orcidEmail?: string;
  orcidEmailVerified?: boolean;
  // unverified: the account waiting for its email to be confirmed.
  pendingUserId?: string;
};

function flowConfig(event: H3Event): SessionConfig {
  return {
    name: FLOW_COOKIE,
    password: useRuntimeConfig(event).session.password,
    maxAge: ORCID_FLOW_TTL_SECONDS,
    // Lax so the cookie comes back on the redirect from ORCID.
    cookie: {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: !import.meta.dev,
    },
  };
}

export async function startOrcidFlow(event: H3Event, flow: OrcidFlow) {
  const config = flowConfig(event);
  const session = await getSession<Partial<OrcidFlow>>(event, config);

  // h3 keeps the creation time of a cookie that is still valid and counts the
  // lifetime from it, so a new attempt resets it to get the full time.
  session.createdAt = Date.now();
  session.data = { ...flow };

  await updateSession(event, config);
}

export async function readOrcidFlow(event: H3Event): Promise<OrcidFlow | null> {
  // Reading with no cookie would create an empty one.
  if (!getCookie(event, FLOW_COOKIE)) return null;

  const session = await getSession<Partial<OrcidFlow>>(
    event,
    flowConfig(event),
  );
  const { intent, redirect } = session.data;

  if ((intent !== "signin" && intent !== "link") || !redirect) return null;

  return session.data as OrcidFlow;
}

export async function updateOrcidFlow(
  event: H3Event,
  update: Partial<OrcidFlow>,
) {
  await updateSession(event, flowConfig(event), update);
}

export async function clearOrcidFlow(event: H3Event) {
  await clearSession(event, flowConfig(event));
}

/** Where to send someone with an outcome, back to the page they started on. */
export function orcidOutcomePath(
  intent: OrcidIntent,
  outcome: OrcidOutcome,
  redirect?: string,
) {
  if (intent === "link") return `/profile?orcid=${outcome}#orcid`;

  const params = new URLSearchParams({ orcid: outcome });

  if (redirect && redirect !== "/dashboard") params.set("redirect", redirect);

  return `/login?${params.toString()}`;
}

/** Adds ?orcid=<outcome> to a path on this site, keeping its query and hash. */
export function withOrcidOutcome(path: string, outcome: OrcidOutcome) {
  const base = "https://posters.invalid";
  const url = new URL(path, base);

  url.searchParams.set("orcid", outcome);

  return `${url.pathname}${url.search}${url.hash}`;
}

const orcidEmailsSchema = z.object({
  email: z
    .array(
      z.object({
        email: z.string().nullish(),
        primary: z.boolean().nullish(),
        verified: z.boolean().nullish(),
      }),
    )
    .nullish(),
});

/**
 * The email someone made public on their ORCID record, if any. Most people
 * keep it private, and any failure counts as none: it only fills in a form.
 */
export async function fetchOrcidPublicEmail(
  orcid: string,
): Promise<{ email: string; verified: boolean } | null> {
  const config = orcidSignInConfig();

  if (!config) return null;

  try {
    const response = await $fetch(`${config.publicApi}/v3.0/${orcid}/email`, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      timeout: 5000,
    });
    const parsed = orcidEmailsSchema.safeParse(response);
    const emails = (parsed.data?.email ?? []).flatMap((entry) => {
      const email = entry.email?.trim().toLowerCase() ?? "";

      if (!z.email().safeParse(email).success) return [];

      return [
        { email, primary: !!entry.primary, verified: entry.verified === true },
      ];
    });
    const pick = emails.find((entry) => entry.primary) ?? emails[0];

    return pick ? { email: pick.email, verified: pick.verified } : null;
  } catch (error) {
    logwatch.warn({
      action: "auth.orcid.public_email",
      message: "Could not read the public email from ORCID",
      orcid,
      error: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}
