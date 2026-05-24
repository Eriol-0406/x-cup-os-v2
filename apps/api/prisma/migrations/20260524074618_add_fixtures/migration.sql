-- CreateTable
CREATE TABLE "Fixture" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "homeTeamLogo" TEXT NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "awayTeamLogo" TEXT NOT NULL,
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "penaltyHome" INTEGER,
    "penaltyAway" INTEGER,
    "venueName" TEXT,
    "venueCity" TEXT,
    "group" TEXT,
    "rawJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FixtureMarket" (
    "fixtureId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "marketId" INTEGER NOT NULL,
    "outcomeCount" INTEGER NOT NULL,
    "createMarketTx" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FixtureMarket_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Fixture_status_idx" ON "Fixture"("status");

-- CreateIndex
CREATE INDEX "Fixture_date_idx" ON "Fixture"("date");

-- CreateIndex
CREATE INDEX "Fixture_round_idx" ON "Fixture"("round");

-- CreateIndex
CREATE UNIQUE INDEX "FixtureMarket_marketId_key" ON "FixtureMarket"("marketId");
