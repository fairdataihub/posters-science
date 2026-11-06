-- Owners can hide the member count from their public page. Existing pages
-- keep showing it.
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "showMemberCount" BOOLEAN NOT NULL DEFAULT true;
