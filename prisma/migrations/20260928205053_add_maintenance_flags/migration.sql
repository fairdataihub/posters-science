-- CreateTable
CREATE TABLE "MaintenanceFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL DEFAULT '',
    "enabledAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceFlag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "MaintenanceFlag_enabled_idx" ON "MaintenanceFlag"("enabled");

-- AddForeignKey
ALTER TABLE "MaintenanceFlag" ADD CONSTRAINT "MaintenanceFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;