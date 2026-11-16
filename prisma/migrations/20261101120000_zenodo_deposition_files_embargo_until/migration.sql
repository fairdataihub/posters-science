-- Zenodo file embargo end date (YYYY-MM-DD, UTC), set when publishing with restricted files.
ALTER TABLE "ZenodoDeposition" ADD COLUMN "filesEmbargoUntil" TEXT;
