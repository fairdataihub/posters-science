-- Conference bulk imports have no poster limit and now queue as one
-- ExtractionBatch per submit, so batches no longer have a 50-file cap.
ALTER TABLE "ExtractionBatch" DROP CONSTRAINT "ExtractionBatch_totalFiles_check";
ALTER TABLE "ExtractionBatch" ADD CONSTRAINT "ExtractionBatch_totalFiles_check" CHECK ("totalFiles" >= 1);
