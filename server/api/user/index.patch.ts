import { z } from "zod";

const updateUserSchema = z.object({
  givenName: z.string().optional(),
  familyName: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) =>
    updateUserSchema.safeParse(b),
  );

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid profile data",
      data: z.treeifyError(body.error).toString(),
    });
  }

  const { data } = body;
  const updatePayload: {
    givenName?: string;
    familyName?: string;
  } = {};

  if (data.givenName !== undefined) updatePayload.givenName = data.givenName;
  if (data.familyName !== undefined) updatePayload.familyName = data.familyName;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updatePayload,
    select: {
      id: true,
      givenName: true,
      familyName: true,
      created: true,
      updated: true,
    },
  });

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: "User not found",
    });
  }

  return user;
});
