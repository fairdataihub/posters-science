import { logwatch } from "../../../utils/logwatch";
import { requireDbUserSession } from "../../../utils/requireDbUserSession";

// Unlink ORCID from the signed-in account. Allowed even while ORCID sign-in is
// paused. Refused for an account with no password, which would have no way left
// to sign in.
export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireDbUserSession(event);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { id: true, password: true },
  });

  if (user.password === null) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "Set a password first, so you can still sign in after unlinking ORCID.",
      data: { reason: "no_password" },
    });
  }

  const { count } = await prisma.linkedAccount.deleteMany({
    where: { userId: user.id, provider: "orcid" },
  });

  if (count > 0) {
    logwatch.info({
      action: "user.orcid.unlink",
      message: "ORCID iD unlinked",
      userId: user.id,
    });
  }

  return { unlinked: count > 0 };
});
