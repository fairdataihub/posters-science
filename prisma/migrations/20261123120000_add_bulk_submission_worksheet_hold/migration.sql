-- Worksheet hold: a batch whose refused worksheet was sent to the team stays
-- on the first step until an admin releases it.
-- AlterTable
ALTER TABLE "BulkSubmission" ADD COLUMN     "worksheetHeldAt" TIMESTAMP(3),
ADD COLUMN     "worksheetHoldFiles" TEXT[] DEFAULT ARRAY[]::TEXT[];
