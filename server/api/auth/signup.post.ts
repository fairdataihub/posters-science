import { z } from "zod";
import { hash } from "bcrypt";
import { nanoid } from "nanoid";
import dayjs from "dayjs";
import { sendEmail } from "../../utils/sendEmail";

const signupSchema = z.object({
  emailAddress: z.string().email(),
  familyName: z.string(),
  givenName: z.string(),
  password: z.string().min(8),
});

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  const { environment } = config.public;

  if (environment !== "development") {
    throw createError({
      statusCode: 404,
      statusMessage: "Not enabled",
    });
  }

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

  // Check if the user already exists
  const user = await prisma.user.findUnique({
    where: {
      emailAddress: body.data.emailAddress,
    },
  });

  if (user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Email address already in use",
    });
  }

  const emailVerificationEnabled = config.public.ENABLE_EMAIL_VERIFICATION;

  // Create a new user
  const hashedPassword = await hash(body.data.password, 10);
  const verificationToken = nanoid();
  const tokenExpiry = dayjs().add(30, "minute").toDate();

  const newUser = await prisma.user.create({
    data: {
      emailAddress: body.data.emailAddress,
      // If email verification is enabled, we need to store the verification token and expiry date
      emailVerificationToken: emailVerificationEnabled
        ? verificationToken
        : null,
      emailVerificationTokenExpires: emailVerificationEnabled
        ? tokenExpiry
        : null,
      emailVerified: !emailVerificationEnabled, // UPDATE THIS IF EMAIL VERIFICATION IS ENABLED
      emailVerifiedAt: emailVerificationEnabled ? null : new Date(),
      familyName: body.data.familyName,
      givenName: body.data.givenName,
      password: hashedPassword,
    },
  });

  if (!newUser) {
    throw createError({
      statusCode: 500,
      statusMessage: "Error creating user",
    });
  }

  if (emailVerificationEnabled) {
    // Send verification email
    const verificationLink = `${config.emailVerificationDomain}/verify-email?token=${verificationToken}`;

    await sendEmail(
      newUser.emailAddress,
      "Verify Your Email Address",
      verificationLink,
    );

    return { message: "Verification email sent. Please check your inbox." };
  }

  return { message: "User created successfully" };
});
