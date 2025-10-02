import { z } from "zod";

const registerSchema = z.object({
  emailAddress: z.string().email(),
});

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) =>
    registerSchema.safeParse(b),
  );

  if (!body.success) {
    console.log(body.error);

    throw createError({
      statusCode: 400,
      statusMessage: "Missing registration information",
    });
  }

  const emailAddress = body.data.emailAddress.toLowerCase().trim();

  // Check if email already exists
  const existingUser = await prisma.userInterest.findFirst({
    where: {
      emailAddress,
    },
  });

  if (!existingUser) {
    await prisma.userInterest.create({
      data: {
        emailAddress,
      },
    });
  }

  return { message: "User interest registered" };
});