import { z } from "zod";
import { compare } from "bcrypt";
import { logwatch } from "../../utils/logwatch";

const loginSchema = z.object({
  emailAddress: z.email(),
  password: z.string().trim().min(8),
});

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  if ("user" in session) {
    return sendRedirect(event, "/dashboard");
  }

  const body = await readValidatedBody(event, (b) => loginSchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing login credentials",
    });
  }

  const emailAddress = body.data.emailAddress.trim().toLowerCase();

  // Check if the email is allowed in development
  const config = useRuntimeConfig();
  const siteEnv = config.siteEnv || config.public.siteEnv;
  const isDev = siteEnv === "development" || siteEnv === "dev";

  if (!isDev && emailAddress == "rick@example.com") {
    throw createError({
      statusCode: 403,
      statusMessage: "The email address is not allowed.",
    });
  }

  // Get the user from the database
  const user = await prisma.user.findUnique({
    where: {
      emailAddress,
    },
  });

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid email address or password",
    });
  }

  // Check if the password matches
  if (!(await compare(body.data.password, user.password))) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid email address or password",
    });
  }

  // Check if the user has verified their email (skipped in development).
  // Runs after the password check so only the account holder learns that the
  // address is registered but unverified, and only they are offered a new link.
  if (!isDev && !user.emailVerified) {
    logwatch.info({
      action: "auth.login",
      message: "Login refused because the email address is not verified",
      userId: user.id,
    });

    throw createError({
      statusCode: 403,
      statusMessage:
        "Your email address has not been verified yet. Check your inbox for the verification link or request a new one.",
      data: { reason: "unverified" },
    });
  }

  // Create a new session for the user
  const userData = {
    id: user.id,
    emailAddress: user.emailAddress,
    emailVerified: user.emailVerified,
    familyName: user.familyName,
    givenName: user.givenName,
    role: user.role,
  };

  await setUserSession(event, {
    loggedInAt: new Date(),
    user: userData,
    userSessionField: "",
  });

  return sendRedirect(event, "/dashboard");
});
