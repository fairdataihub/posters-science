-- The extraction worker emails a batch owner once every job in the batch has
-- finished, and records the send here so each batch is emailed at most once.
-- AlterTable
ALTER TABLE "ExtractionBatch" ADD COLUMN "completionEmailSentAt" TIMESTAMP(3);

-- Existing batches predate completion emails; don't email them now.
UPDATE "ExtractionBatch" SET "completionEmailSentAt" = now();