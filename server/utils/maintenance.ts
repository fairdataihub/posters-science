import {
  isMaintenanceKey,
  resolveMaintenanceMessage,
  type ActiveMaintenance,
  type MaintenanceKey,
} from "#shared/utils/maintenance";

// Admins toggle these from /admin, so the hot upload and publish paths would
// otherwise pay for an extra query on every request. The cache is per process:
// on a multi instance deploy a toggle takes up to CACHE_TTL_MS to reach every
// instance, which is fine for a maintenance switch.
const CACHE_TTL_MS = 10_000;

let cache: { at: number; value: ActiveMaintenance[] } | null = null;

export function invalidateMaintenanceCache() {
  cache = null;
}

export async function getActiveMaintenance(): Promise<ActiveMaintenance[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  const rows = await prisma.maintenanceFlag.findMany({
    where: { enabled: true },
    select: { key: true, message: true, enabledAt: true },
  });

  const value = rows.flatMap<ActiveMaintenance>((row) => {
    // A key retired from the code but left in the database must not block anything.
    if (!isMaintenanceKey(row.key)) return [];

    return [
      {
        key: row.key,
        message: resolveMaintenanceMessage(row.key, row.message),
        since: row.enabledAt?.toISOString() ?? null,
      },
    ];
  });

  cache = { at: Date.now(), value };

  return value;
}

export async function isUnderMaintenance(key: MaintenanceKey) {
  const active = await getActiveMaintenance();

  return active.some((entry) => entry.key === key);
}

/**
 * Throws 503 with the admin authored message when the workflow is paused.
 * Call it straight after the session check, before any external work.
 */
export async function assertNotInMaintenance(key: MaintenanceKey) {
  const active = await getActiveMaintenance();
  const match = active.find((entry) => entry.key === key);

  if (match) {
    throw createError({
      statusCode: 503,
      statusMessage: match.message,
      data: { maintenance: key, message: match.message },
    });
  }
}
