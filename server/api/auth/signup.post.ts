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
  const { siteEnv } = config.public;

  if (siteEnv !== "dev" && siteEnv !== "staging" && siteEnv !== "development") {
    throw createError({
      statusCode: 404,
      statusMessage: "Signup is not enabled for this environment",
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

  const existingUser = await prisma.user.findUnique({
    where: { emailAddress: body.data.emailAddress },
  });

  if (existingUser) {
    throw createError({
      statusCode: 401,
      statusMessage: "Email address already in use",
    });
  }

  const isDev = siteEnv === "development" || siteEnv === "dev";

  const hashedPassword = await hash(body.data.password, 10);
  const verificationToken = nanoid();
  const tokenExpiry = dayjs().add(30, "minute").toDate();

  await prisma.user.create({
    data: {
      emailAddress: body.data.emailAddress,
      emailVerificationToken: isDev ? null : verificationToken,
      emailVerificationTokenExpires: isDev ? null : tokenExpiry,
      emailVerified: isDev,
      emailVerifiedAt: isDev ? new Date() : null,
      familyName: body.data.familyName,
      givenName: body.data.givenName,
      password: hashedPassword,
    },
  });

  if (!isDev) {
    const verificationLink = `${config.siteUrl}/verify-email?token=${verificationToken}`;

    await sendEmail({
      to: body.data.emailAddress,
      subject: "Verify your email address — Posters.Science",
      html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333;">
  <h2 style="color: #1a1a1a;">Confirm Your Email Address</h2>
  <p>Hi ${body.data.givenName},</p>
  <p>Thanks for signing up to Posters.Science! Please verify your email address by clicking the button below.</p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${verificationLink}"
       style="background-color: #4F46E5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
      Verify My Email
    </a>
  </div>
  <p style="font-size: 13px; color: #666;">
    If the button doesn't work, copy and paste this link into your browser:<br/>
    <a href="${verificationLink}" style="color: #4F46E5; word-break: break-all;">${verificationLink}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">This link expires in <strong>30 minutes</strong>. If you didn't create an account, you can safely ignore this email.</p>
  <p style="font-size: 13px; color: #555;">~ Posters.Science</p>
</div>
      `,
    });

    return { message: "Verification email sent. Please check your inbox." };
  }

  return { message: "User created successfully" };
});
