-- The release (deploy run number) the bulk wizard last opened a batch on. A
-- batch opened on a higher release starts again at the first step.
-- AlterTable
ALTER TABLE "BulkSubmission" ADD COLUMN     "wizardRelease" INTEGER;
