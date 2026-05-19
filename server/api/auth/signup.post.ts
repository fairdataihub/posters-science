import { z } from "zod";
import { hash } from "bcrypt";
import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import dayjs from "dayjs";
import { sendEmail } from "../../utils/sendEmail";

const signupSchema = z.object({
  emailAddress: z.email(),
  familyName: z.string(),
  givenName: z.string(),
  password: z
    .string()
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
    throw createError({
      statusCode: 401,
      statusMessage: "Email address already in use",
    });
  }

  const isDev = siteEnv === "development" || siteEnv === "dev";

  const hashedPassword = await hash(body.data.password, 10);
  const rawVerificationToken = nanoid();
  const verificationTokenHash = createHash("sha256")
    .update(rawVerificationToken)
    .digest("hex");
  const tokenExpiry = dayjs().add(30, "minute").toDate();

  await prisma.user.create({
    data: {
      emailAddress,
      emailVerificationToken: isDev ? null : verificationTokenHash,
      emailVerificationTokenExpires: isDev ? null : tokenExpiry,
      emailVerified: isDev,
      emailVerifiedAt: isDev ? new Date() : null,
      familyName: body.data.familyName,
      givenName: body.data.givenName,
      password: hashedPassword,
    },
  });

  if (!isDev) {
    const verificationLink = `${config.siteUrl}/verify-email?token=${rawVerificationToken}`;

    await sendEmail({
      to: emailAddress,
      subject: "Verify your email address - Posters.science",
      html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333;">
  <h2 style="color: #1a1a1a;">Confirm Your Email Address</h2>
  <p>Hi ${body.data.givenName},</p>
  <p>Thanks for signing up to Posters.science! Please verify your email address by clicking the button below.</p>
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
  <p style="font-size: 13px; color: #555;">~ Posters.science</p>
</div>
      `,
    });

    return { message: "Verification email sent. Please check your inbox." };
  }

  return { message: "User created successfully" };
});
