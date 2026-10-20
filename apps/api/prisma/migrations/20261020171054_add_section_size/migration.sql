-- Add student headcount to sections. Existing rows backfilled to 40.
ALTER TABLE "sections" ADD COLUMN "size" INTEGER NOT NULL DEFAULT 40;
