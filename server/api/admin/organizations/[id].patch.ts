import { z } from "zod";

const patchSchema = z.object({
  hidden: z.boolean(),
  reason: z.string().trim().min(1).max(1000),
});

/**
 * Hides an organization's page from the public or restores it. Its posters are
 * untouched and stay public on their own pages.
 */
export default defineEventHandler(async (event) => {
  const session = await requireAdminSession(event);
  const organizationId = getRouterParam(event, "id") ?? "";

  const body = await readValidatedBody(event, (b) => patchSchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "A reason is required",
    });
  }

  const { hidden, reason } = body.data;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { hiddenAt: true, name: true },
  });

  if (!organization) {
    throw createError({
      statusCode: 404,
      statusMessage: "Organization not found",
    });
  }

  if ((organization.hiddenAt !== null) === hidden) {
    throw createError({
      statusCode: 409,
      statusMessage: hidden
        ? "This organization is already hidden"
        : "This organization is not hidden",
    });
  }

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      hiddenAt: hidden ? new Date() : null,
      hiddenReason: hidden ? reason : "",
    },
    select: { id: true, hiddenAt: true, hiddenReason: true },
  });

  await logAdminAction({
    adminUserId: session.user.id,
    action: hidden ? "HIDE_ORGANIZATION" : "RESTORE_ORGANIZATION",
    entityType: "organization",
    entityId: organizationId,
    details: { name: organization.name, reason },
  });

  return updated;
});
