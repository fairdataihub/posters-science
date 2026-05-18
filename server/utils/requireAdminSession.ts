export async function requireAdminSession(event: Parameters<typeof getUserSession>[0]) {
  const session = await requireUserSession(event);

  if (session.user.role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "Forbidden",
    });
  }

  return session;
}
