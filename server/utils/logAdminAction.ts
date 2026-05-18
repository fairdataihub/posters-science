export async function logAdminAction(params: {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: object;
}) {
  await prisma.adminAuditLog.create({
    data: {
      adminUserId: params.adminUserId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details ?? undefined,
    },
  });
}
