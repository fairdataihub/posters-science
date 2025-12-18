import { z } from "zod";

const posterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
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

  const session = await requireUserSession(event);
  const { user } = session;
  const userId = user.id;

  const body = await readValidatedBody(event, (b) => posterSchema.safeParse(b));
  if (!body.success) {
    console.log(body.error);

    throw createError({
      statusCode: 400,
      statusMessage: "Missing poster information",
    });
  }

  const { title, description } = body.data;

  return await prisma.poster.create({
    data: {
      title,
      description,
      imageUrl: "",
      status: "draft",
      user: { connect: { id: userId } },
    },
  });
});
