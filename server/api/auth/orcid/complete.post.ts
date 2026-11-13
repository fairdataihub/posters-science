import { z } from "zod";
import { isUniqueConstraintError } from "../../../utils/claims";
import { issueEmailVerification } from "../../../utils/issueEmailVerification";
import { logwatch } from "../../../utils/logwatch";
import { assertNotInMaintenance } from "../../../utils/maintenance";
import {
  clearOrcidFlow,
  isDevSite,
  readOrcidFlow,
  updateOrcidFlow,
} from "../../../utils/orcidSignIn";

const schema = z.object({
  emailAddress: z.email(),
  familyName: z.string().trim().min(1),
  givenName: z.string().trim().min(1),
});

/**
 * Finish signing up after ORCID confirmed the iD. Creates an account with no
 * password, linked to that iD. The email must be verified before the first
 * sign in, like a password signup, unless it is the address ORCID itself
 * reported as verified.
 */
export default defineEventHandler(async (event) => {
  await assertNotInMaintenance("orcidSignIn");

  const flow = await readOrcidFlow(event);

  if (flow?.stage !== "signup" || !flow.orcid) {
    throw createError({
      statusCode: 410,
      statusMessage: "Your ORCID sign-in expired. Please start again.",
      data: { reason: "expired" },
    });
  }

  const { orcid } = flow;
  const session = await getUserSession(event);

  if (session.user) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "You are already signed in. Link ORCID from Settings instead.",
      data: { reason: "signed_in" },
    });
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid signup details",
    });
  }

  const emailAddress = body.data.emailAddress.trim().toLowerCase();

  const existingLink = await prisma.linkedAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "orcid",
        providerAccountId: orcid,
      },
    },
    select: { id: true },
  });

  if (existingLink) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "This ORCID iD already has an account. Sign in with ORCID instead.",
      data: { reason: "linked" },
    });
  }

  const existingConflict = createError({
    statusCode: 409,
    statusMessage:
      "An account with this email address already exists. Sign in with your password, then link ORCID from Settings.",
    data: { reason: "existing" },
  });

  const existingUser = await prisma.user.findUnique({
    where: { emailAddress },
    select: { id: true },
  });

  if (existingUser) {
    logwatch.info({
      action: "auth.signup",
      message:
        "ORCID signup refused because the address already has an account",
      method: "orcid",
      userId: existingUser.id,
    });

    throw existingConflict;
  }

  // Compared with the cookie, never with anything the browser sent.
  const verifiedByOrcid =
    !!flow.orcidEmailVerified && flow.orcidEmail === emailAddress;
  const emailVerified = isDevSite() || verifiedByOrcid;

  let user;

  try {
    user = await prisma.user.create({
      data: {
        emailAddress,
        emailVerified,
        emailVerifiedAt: emailVerified ? new Date() : null,
        familyName: body.data.familyName,
        givenName: body.data.givenName,
        password: null,
        linkedAccounts: {
          create: { provider: "orcid", providerAccountId: orcid },
        },
      },
    });
  } catch (error) {
    // The same email or iD was registered a moment ago.
    if (isUniqueConstraintError(error)) throw existingConflict;

    throw error;
  }

  logwatch.info({
    action: "auth.signup",
    message: "Account created with ORCID",
    method: "orcid",
    userId: user.id,
    verificationRequired: !emailVerified,
    verifiedByOrcid,
  });

  if (emailVerified) {
    const { redirect } = flow;

    await createUserSession(event, user);
    await clearOrcidFlow(event);

    return { signedIn: true as const, redirect };
  }

  // Kept so the page can resend the link without asking for the address.
  await updateOrcidFlow(event, { stage: "unverified", pendingUserId: user.id });

  try {
    await issueEmailVerification(user);
  } catch (error) {
    logwatch.error({
      action: "auth.signup",
      message:
        "ORCID account created but the verification email could not be sent",
      method: "orcid",
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });

    throw createError({
      statusCode: 502,
      statusMessage:
        "Your account was created but the verification email could not be sent. Please send a new one.",
      data: { reason: "unverified" },
    });
  }

  return { signedIn: false as const, emailAddress };
});
