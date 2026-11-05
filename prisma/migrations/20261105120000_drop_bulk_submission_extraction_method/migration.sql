-- Bulk imports always keep everything extraction finds, so the per-batch
-- extraction level is no longer stored.
ALTER TABLE "BulkSubmission" DROP COLUMN "extractionMethod";
