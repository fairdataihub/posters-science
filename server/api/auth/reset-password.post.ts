import { z } from "zod";
import { hash } from "bcrypt";

const schema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
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

  const record = await prisma.userForgotPassword.findUnique({
    where: { resetToken: token },
    select: { userId: true, expiresAt: true },
  });

  if (!record) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid or expired reset link",
    });
  }

  if (record.expiresAt < new Date()) {
    await prisma.userForgotPassword.delete({ where: { resetToken: token } });
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

  await prisma.userForgotPassword.delete({ where: { resetToken: token } });

  return { success: true };
});
