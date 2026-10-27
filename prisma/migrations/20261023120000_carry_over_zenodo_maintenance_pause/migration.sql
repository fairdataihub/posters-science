-- The "zenodo" maintenance switch was split into "zenodoOAuth" and
-- "zenodoToken", and pausing both is what turns Zenodo off now. A pause in
-- force when this runs is carried over to both, so Zenodo stays off after the
-- deploy. Its message replaces any on the new rows, since the off notice shows
-- whichever row has one.
--
-- The old row is kept: migrations run before the new version takes over, and
-- the version still serving reads it until then. The new version ignores it.
INSERT INTO "MaintenanceFlag" ("key", "enabled", "message", "enabledAt", "updatedById", "updated")
SELECT new_key, true, old."message", old."enabledAt", old."updatedById", CURRENT_TIMESTAMP
FROM "MaintenanceFlag" AS old
CROSS JOIN (VALUES ('zenodoOAuth'), ('zenodoToken')) AS new_keys (new_key)
WHERE old."key" = 'zenodo' AND old."enabled"
ON CONFLICT ("key") DO UPDATE SET
    "enabled" = true,
    "message" = EXCLUDED."message",
    "enabledAt" = COALESCE("MaintenanceFlag"."enabledAt", EXCLUDED."enabledAt"),
    "updatedById" = EXCLUDED."updatedById",
    "updated" = CURRENT_TIMESTAMP;
