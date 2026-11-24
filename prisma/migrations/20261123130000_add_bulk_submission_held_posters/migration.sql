-- Partial worksheet hold: posters that did not match the worksheet, held
-- from publishing until an admin releases them.
-- AlterTable
ALTER TABLE "BulkSubmission" ADD COLUMN     "heldPosters" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "postersHeldAt" TIMESTAMP(3);
