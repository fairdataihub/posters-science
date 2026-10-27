import { z } from "zod";

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

/**
 * Revokes a claim. The row is deleted, and the audit log keeps who held it
 * and why it was removed.
 */
export default defineEventHandler(async (event) => {
  const session = await requireAdminSession(event);
  const claimId = getRouterParam(event, "id");

  if (!claimId) {
    throw createError({ statusCode: 400, statusMessage: "Invalid claim id" });
  }

  const body = await readValidatedBody(event, (b) => bodySchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "A reason is required to revoke a claim",
    });
  }

  const claim = await prisma.posterClaim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      posterId: true,
      userId: true,
      role: true,
      created: true,
      user: { select: { emailAddress: true } },
    },
  });

  if (!claim) {
    throw createError({ statusCode: 404, statusMessage: "Claim not found" });
  }

  await prisma.posterClaim.delete({ where: { id: claim.id } });

  await logAdminAction({
    adminUserId: session.user.id,
    action: "REVOKE_CLAIM",
    entityType: "claim",
    entityId: claim.id,
    details: {
      posterId: claim.posterId,
      role: claim.role,
      claimantId: claim.userId,
      claimantEmail: claim.user.emailAddress,
      claimedAt: claim.created,
      reason: body.data.reason,
    },
  });

  return { success: true };
});
