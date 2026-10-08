import prisma from "~~/server/utils/prisma";

/**
 * Ensures the session user still exists in Postgres (e.g. after switching to a fresh local DB).
 */
export async function requireDbUserSession(
  event: Parameters<typeof requireUserSession>[0],
) {
  const session = await requireUserSession(event);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Session expired",
      message:
        "Your account is not in this database. Sign out, then sign up or log in again.",
    });
  }

  return session;
}
