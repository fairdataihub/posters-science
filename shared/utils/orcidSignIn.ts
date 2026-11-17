// Sign in with ORCID. GET /api/auth/orcid sends people to ORCID and back, then
// on to /login or Settings with ?orcid=<outcome> when there is something to say.

export const ORCID_INTENTS = ["signin", "link"] as const;

export type OrcidIntent = (typeof ORCID_INTENTS)[number];

/** How long someone has to come back from ORCID and finish signing up. */
export const ORCID_FLOW_TTL_SECONDS = 30 * 60;

export const ORCID_OUTCOMES = [
  // Failures, shown on /login or Settings.
  "cancelled",
  "expired",
  "error",
  "unavailable",
  "paused",
  // Signed in with ORCID but the account's email is not verified yet.
  "unverified",
  // Linking from Settings.
  "linked",
  "taken",
  "already",
  // Added to the page after a successful sign in, for analytics only.
  "signedin",
] as const;

export type OrcidOutcome = (typeof ORCID_OUTCOMES)[number];

export function isOrcidOutcome(value: unknown): value is OrcidOutcome {
  return (
    typeof value === "string" &&
    (ORCID_OUTCOMES as readonly string[]).includes(value)
  );
}

/** Outcomes that mean the attempt did not work, tracked as orcid_signin_failed. */
export const ORCID_FAILURE_OUTCOMES: readonly OrcidOutcome[] = [
  "cancelled",
  "expired",
  "error",
  "unavailable",
  "paused",
  "taken",
  "already",
];

export type OrcidNotice = { title: string; description: string };

const NOTICES: Partial<Record<OrcidOutcome, OrcidNotice>> = {
  cancelled: {
    title: "ORCID sign-in cancelled",
    description: "You left ORCID before finishing, so nothing changed.",
  },
  expired: {
    title: "ORCID sign-in timed out",
    description:
      "It took too long, or it was started in another tab. Please try again.",
  },
  error: {
    title: "ORCID sign-in failed",
    description:
      "ORCID could not confirm your iD. Please try again in a few moments.",
  },
  unavailable: {
    title: "ORCID sign-in is not available",
    description: "Please use your email address and password instead.",
  },
  taken: {
    title: "This ORCID iD is already in use",
    description:
      "It is linked to another Posters.science account. Sign in to that account to use it, or unlink it there first.",
  },
  already: {
    title: "A different ORCID iD is linked",
    description:
      "Your account is already linked to another ORCID iD. Unlink it first, then link this one.",
  },
};

/**
 * The notice for an outcome. "paused" uses the admin's maintenance message,
 * which only the page knows, so it is passed in.
 */
export function orcidOutcomeNotice(
  outcome: OrcidOutcome,
  pausedMessage = "",
): OrcidNotice | null {
  if (outcome === "paused") {
    return {
      title: "ORCID sign-in is paused",
      description:
        pausedMessage ||
        "Signing in with ORCID is paused for maintenance. Please use your email address and password, or try again shortly.",
    };
  }

  return NOTICES[outcome] ?? null;
}

/** What /api/auth/orcid/pending returns to the finish sign-up and login pages. */
export type OrcidPending =
  | {
      kind: "signup";
      orcid: string;
      givenName: string;
      familyName: string;
      // Prefill: the invite address, else ORCID's public email.
      email: string;
      // ORCID's public email when ORCID says it is verified. Keeping it means
      // no confirmation email is needed.
      orcidVerifiedEmail: string;
    }
  | {
      kind: "unverified";
      emailAddress: string;
    };
