-- Additive only: existing jobs remain single-poster jobs with uploaded files.
CREATE TABLE "ExtractionBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalFiles" INTEGER NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtractionBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExtractionBatch_totalFiles_check" CHECK ("totalFiles" BETWEEN 1 AND 50)
);
CREATE UNIQUE INDEX "ExtractionBatch_userId_requestKey_key" ON "ExtractionBatch"("userId", "requestKey");
CREATE INDEX "ExtractionBatch_userId_created_idx" ON "ExtractionBatch"("userId", "created");
ALTER TABLE "ExtractionBatch" ADD CONSTRAINT "ExtractionBatch_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExtractionJob"
    ADD COLUMN "queueClass" TEXT NOT NULL DEFAULT 'single',
    ADD COLUMN "batchId" TEXT,
    ADD COLUMN "batchIndex" INTEGER,
    ADD COLUMN "fileSize" INTEGER,
    ADD COLUMN "fileUploaded" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "ExtractionBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_queueClass_check"
    CHECK (("queueClass" = 'single' AND "batchId" IS NULL)
        OR ("queueClass" = 'bulk' AND "batchId" IS NOT NULL));
CREATE UNIQUE INDEX "ExtractionJob_batchId_batchIndex_key" ON "ExtractionJob"("batchId", "batchIndex");
CREATE INDEX "ExtractionJob_queueClass_completed_status_created_idx"
    ON "ExtractionJob"("queueClass", "completed", "status", "created");
