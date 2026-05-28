-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "season" INTEGER NOT NULL DEFAULT 2022;

-- CreateIndex
CREATE INDEX "Fixture_season_idx" ON "Fixture"("season");
