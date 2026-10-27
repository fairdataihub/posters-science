import {
  MAINTENANCE_KEYS,
  resolveMaintenanceMessage,
} from "#shared/utils/maintenance";

export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const rows = await prisma.maintenanceFlag.findMany({
    where: { key: { in: [...MAINTENANCE_KEYS] } },
    select: {
      key: true,
      enabled: true,
      message: true,
      enabledAt: true,
      updated: true,
      updatedBy: {
        select: {
          id: true,
          givenName: true,
          familyName: true,
          emailAddress: true,
        },
      },
    },
  });

  const byKey = new Map(rows.map((row) => [row.key, row]));

  // Return every key, even ones with no row yet, so the admin panel does not
  // have to fill in defaults itself. No row means the workflow is live.
  const data = MAINTENANCE_KEYS.map((key) => {
    const row = byKey.get(key);

    return {
      key,
      enabled: row?.enabled ?? false,
      message: row?.message ?? "",
      previewMessage: resolveMaintenanceMessage(key, row?.message),
      enabledAt: row?.enabledAt ?? null,
      updated: row?.updated ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });

  return { data };
});
