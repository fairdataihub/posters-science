-- CreateTable
CREATE TABLE "BulkSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wizardStep" TEXT NOT NULL DEFAULT 'upload',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "extractionMethod" TEXT NOT NULL DEFAULT 'automated',
    "stagedPosters" JSONB NOT NULL DEFAULT '[]',
    "licenseMetadataFileName" TEXT,
    "licenseMetadataFilePath" TEXT,
    "zipFileName" TEXT,
    "zipFilePath" TEXT,
    "posterCount" INTEGER,
    "submissionSummary" JSONB,
    "error" TEXT,
    "managedConferenceId" TEXT,
    "completedAt" TIMESTAMP(3),
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkSubmission_userId_updated_idx" ON "BulkSubmission"("userId", "updated");

-- CreateIndex
CREATE INDEX "BulkSubmission_status_idx" ON "BulkSubmission"("status");

-- AddForeignKey
ALTER TABLE "BulkSubmission" ADD CONSTRAINT "BulkSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
