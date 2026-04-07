import { z } from "zod";
import { compare, hash } from "bcrypt";

const schema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) => schema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid request body",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: "User not found",
    });
  }

  if (!(await compare(body.data.currentPassword, user.password))) {
    throw createError({
      statusCode: 401,
      statusMessage: "Current password is incorrect",
    });
  }

  const hashed = await hash(body.data.newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  });

  return { success: true };
});
