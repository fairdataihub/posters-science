import type { OrcidPending } from "#shared/utils/orcidSignIn";
import { readOrcidFlow } from "../../../utils/orcidSignIn";

// The ORCID sign-in waiting in this browser's sealed cookie, for the finish
// sign-up page and the login page's "verify your email" notice. Only someone who
// just came back from ORCID holds that cookie.
export default defineEventHandler(async (event): Promise<OrcidPending> => {
  const flow = await readOrcidFlow(event);

  if (flow?.stage === "signup" && flow.orcid) {
    return {
      kind: "signup",
      orcid: flow.orcid,
      givenName: flow.givenName ?? "",
      familyName: flow.familyName ?? "",
      email: flow.inviteEmail || flow.orcidEmail || "",
      orcidVerifiedEmail:
        flow.orcidEmailVerified && flow.orcidEmail ? flow.orcidEmail : "",
    };
  }

  if (flow?.stage === "unverified" && flow.pendingUserId) {
    const user = await prisma.user.findUnique({
      where: { id: flow.pendingUserId },
      select: { emailAddress: true, emailVerified: true },
    });

    if (user && !user.emailVerified) {
      return { kind: "unverified", emailAddress: user.emailAddress };
    }
  }

  throw createError({
    statusCode: 404,
    statusMessage: "No ORCID sign-in in progress",
  });
});
