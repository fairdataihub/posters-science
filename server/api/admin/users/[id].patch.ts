import { z } from "zod";

const patchSchema = z.object({
  role: z.enum(["user", "admin"]),
});

export default defineEventHandler(async (event) => {
  const session = await requireAdminSession(event);
  const targetId = getRouterParam(event, "id");

  const body = await readValidatedBody(event, (b) => patchSchema.safeParse(b));
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid body" });
  }

  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { role: body.data.role },
    select: { id: true, role: true },
  });

  await logAdminAction({
    adminUserId: session.user.id,
    action: "UPDATE_USER_ROLE",
    entityType: "user",
    entityId: targetId!,
    details: { previousRole: existing.role, newRole: body.data.role },
  });

  return updated;
});
