import { z } from "zod";
import { compare } from "bcrypt";

const loginSchema = z.object({
  emailAddress: z.string().email(),
  password: z.string().min(8),
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

  // Get the user from the database
  const user = await prisma.user.findUnique({
    where: {
      emailAddress: body.data.emailAddress,
    },
  });

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid email address or password",
    });
  }

  // Check if the user has verified their email
  if (!user.emailVerified) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Email not verified. Please check your email for the verification link.",
    });
  }

  // Check if the password matches
  if (!(await compare(body.data.password, user.password))) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid email address or password",
    });
  }

  // Create a new session for the user
  const userData = {
    id: user.id,
    emailAddress: user.emailAddress,
    emailVerified: user.emailVerified,
    familyName: user.familyName,
    givenName: user.givenName,
  };

  await setUserSession(event, {
    loggedInAt: new Date(),
    user: userData,
    userSessionField: "",
  });

  return sendRedirect(event, "/dashboard");
});
