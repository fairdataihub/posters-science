import { z } from "zod";
import { hash } from "bcrypt";
import { issueEmailVerification } from "../../utils/issueEmailVerification";
import { logwatch } from "../../utils/logwatch";

const signupSchema = z.object({
  emailAddress: z.email(),
  familyName: z.string(),
  givenName: z.string(),
  password: z
    .string()
    .trim()
    .min(12, "Must be at least 12 characters")
    .max(128, "Must be at most 128 characters"),
});

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const siteEnv = config.siteEnv || config.public.siteEnv;

  const session = await getUserSession(event);

  if ("user" in session) {
    return sendRedirect(event, "/dashboard");
  }

  const body = await readValidatedBody(event, (b) => signupSchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid signup details",
    });
  }

  const emailAddress = body.data.emailAddress.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { emailAddress },
  });

  if (existingUser) {
    // An unverified account still occupies the address, so a second signup is
    // refused. The reason is returned so the page can offer a new
    // verification link rather than leaving the user with a dead end.
    logwatch.info({
      action: "auth.signup",
      message: "Signup refused because the address already has an account",
      userId: existingUser.id,
      emailVerified: existingUser.emailVerified,
    });

    throw createError({
      statusCode: 409,
      statusMessage: existingUser.emailVerified
        ? "An account with this email address already exists. Please log in."
        : "You already have an account with this email address that still needs to be verified.",
      data: { reason: existingUser.emailVerified ? "verified" : "unverified" },
    });
  }

  const isDev = siteEnv === "development" || siteEnv === "dev";

  const hashedPassword = await hash(body.data.password, 10);

  const user = await prisma.user.create({
    data: {
      emailAddress,
      emailVerified: isDev,
      emailVerifiedAt: isDev ? new Date() : null,
      familyName: body.data.familyName,
      givenName: body.data.givenName,
      password: hashedPassword,
    },
  });

  logwatch.info({
    action: "auth.signup",
    message: "Account created",
    userId: user.id,
    verificationRequired: !isDev,
  });

  if (!isDev) {
    try {
      await issueEmailVerification(user);
    } catch (error) {
      // The account exists by this point, so a bare 500 would strand the user:
      // signing up again hits the conflict above and logging in is blocked
      // until verification.
      logwatch.error({
        action: "auth.signup",
        message: "Account created but the verification email could not be sent",
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw createError({
        statusCode: 502,
        statusMessage:
          "Your account was created but the verification email could not be sent. Please request a new one.",
        data: { reason: "unverified" },
      });
    }

    return { message: "Verification email sent. Please check your inbox." };
  }

  return { message: "User created successfully" };
});
