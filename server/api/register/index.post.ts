import { z } from "zod";

const registerSchema = z.object({
  emailAddress: z.string().email(),
});

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) =>
    registerSchema.safeParse(b),
  );

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing registration information",
    });
  }

  const userInterest = await prisma.userInterest.create({
    data: {
      emailAddress: body.data.emailAddress,
    },
  });

  return userInterest;
});
