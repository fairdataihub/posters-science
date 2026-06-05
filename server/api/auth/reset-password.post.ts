import { z } from "zod";
import { hash } from "bcrypt";
import { createHash } from "node:crypto";

const schema = z.object({
  token: z.string().trim().min(1, "Token is required"),
  password: z
    .string()
    .trim()
    .min(12, "Must be at least 12 characters")
    .max(128, "Must be at most 128 characters"),
});

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => schema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid request",
    });
  }

  const { token, password } = body.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const record = await prisma.userForgotPassword.findUnique({
    where: { resetToken: tokenHash },
    select: { userId: true, expiresAt: true },
  });

  if (!record) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid or expired reset link",
    });
  }

  if (record.expiresAt < new Date()) {
    await prisma.userForgotPassword.delete({
      where: { resetToken: tokenHash },
    });
    throw createError({
      statusCode: 400,
      statusMessage: "This reset link has expired. Please request a new one.",
    });
  }

  const hashed = await hash(password, 10);

  await prisma.user.update({
    where: { id: record.userId },
    data: { password: hashed },
  });

  await prisma.userForgotPassword.delete({ where: { resetToken: tokenHash } });

  return { success: true };
});
