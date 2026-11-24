-- Why a batch is on a worksheet hold: an unsupported platform, or a refused
-- worksheet the team is fixing; with the platform and the refusal reasons.
-- AlterTable
ALTER TABLE "BulkSubmission" ADD COLUMN     "worksheetHoldPlatform" TEXT,
ADD COLUMN     "worksheetHoldProblems" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "worksheetHoldReason" TEXT;
