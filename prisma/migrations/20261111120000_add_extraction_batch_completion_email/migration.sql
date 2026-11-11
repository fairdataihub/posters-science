-- The extraction worker emails a batch owner once every job in the batch has
-- finished, and records the send here so each batch is emailed at most once.
-- AlterTable
ALTER TABLE "ExtractionBatch" ADD COLUMN "completionEmailSentAt" TIMESTAMP(3);
