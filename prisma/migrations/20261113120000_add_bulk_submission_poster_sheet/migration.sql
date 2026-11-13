-- A confirmed organizer poster sheet waits on the bulk submission until its
-- rows are saved into the metadata grid, so it survives a reload or another
-- device. Null when no sheet is pending.
-- AlterTable
ALTER TABLE "BulkSubmission" ADD COLUMN     "posterSheet" JSONB;
