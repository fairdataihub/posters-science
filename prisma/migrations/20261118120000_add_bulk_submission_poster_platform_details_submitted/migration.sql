-- True once an organizer who chose "None of these" for poster worksheets has
-- sent us their platform details on Slack.
-- AlterTable
ALTER TABLE "BulkSubmission" ADD COLUMN     "posterPlatformDetailsSubmittedToSlack" BOOLEAN NOT NULL DEFAULT false;
