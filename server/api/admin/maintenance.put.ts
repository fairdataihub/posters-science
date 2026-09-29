import { z } from "zod";

import {
  MAINTENANCE_KEYS,
  resolveMaintenanceMessage,
} from "#shared/utils/maintenance";

const flagSchema = z.object({
  key: z.enum(MAINTENANCE_KEYS),
  enabled: z.boolean(),
  message: z.string().max(500).default(""),
});

// The admin panel saves every pending switch at once, so a single request can
// carry several workflows.
const payloadSchema = z.object({
  flags: z
    .array(flagSchema)
    .min(1)
    .max(MAINTENANCE_KEYS.length)
    .refine(
      (flags) => new Set(flags.map((flag) => flag.key)).size === flags.length,
      { message: "Each maintenance key may only appear once" },
    ),
});

export default defineEventHandler(async (event) => {
  const session = await requireAdminSession(event);

  const { flags } = await readValidatedBody(event, payloadSchema.parse);

  const existing = await prisma.maintenanceFlag.findMany({
    where: { key: { in: flags.map((flag) => flag.key) } },
    select: { key: true, enabled: true, enabledAt: true, message: true },
  });

  const existingByKey = new Map(existing.map((row) => [row.key, row]));

  // Only record what actually moved
  const changed = flags.filter((flag) => {
    const before = existingByKey.get(flag.key);

    return (
      (before?.enabled ?? false) !== flag.enabled ||
      (before?.message ?? "") !== flag.message
    );
  });

  const saved = await prisma.$transaction(
    flags.map((flag) => {
      const before = existingByKey.get(flag.key);

      // Keep the original start time across message edits so "paused since"
      // stays accurate, and clear it once the workflow is live again.
      const enabledAt = flag.enabled
        ? before?.enabled
          ? before.enabledAt
          : new Date()
        : null;

      return prisma.maintenanceFlag.upsert({
        where: { key: flag.key },
        create: {
          key: flag.key,
          enabled: flag.enabled,
          message: flag.message,
          enabledAt,
          updatedById: session.user.id,
        },
        update: {
          enabled: flag.enabled,
          message: flag.message,
          enabledAt,
          updatedById: session.user.id,
        },
        select: { key: true, enabled: true, message: true, enabledAt: true },
      });
    }),
  );

  invalidateMaintenanceCache();

  for (const flag of changed) {
    await logAdminAction({
      adminUserId: session.user.id,
      action: "UPDATE_MAINTENANCE",
      entityType: "maintenance",
      entityId: flag.key,
      details: { enabled: flag.enabled, message: flag.message },
    });
  }

  // Map over the request keys, not the rows: the DB `key` column is a plain
  // string and would drop the MaintenanceKey type.
  const savedByKey = new Map(saved.map((row) => [row.key, row]));

  return {
    data: flags.map((flag) => {
      const row = savedByKey.get(flag.key);
      const message = row?.message ?? flag.message;

      return {
        key: flag.key,
        enabled: row?.enabled ?? flag.enabled,
        message,
        enabledAt: row?.enabledAt ?? null,
        previewMessage: resolveMaintenanceMessage(flag.key, message),
      };
    }),
    changed: changed.map((flag) => flag.key),
  };
});
