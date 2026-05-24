-- CreateTable
CREATE TABLE "TournamentMarket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "season" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "teamName" TEXT NOT NULL,
    "teamLogo" TEXT NOT NULL,
    "teamCode" TEXT,
    "marketId" INTEGER NOT NULL,
    "outcomeCount" INTEGER NOT NULL DEFAULT 2,
    "createMarketTx" TEXT NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "winningOutcome" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMarket_marketId_key" ON "TournamentMarket"("marketId");

-- CreateIndex
CREATE INDEX "TournamentMarket_season_idx" ON "TournamentMarket"("season");

-- CreateIndex
CREATE INDEX "TournamentMarket_settled_idx" ON "TournamentMarket"("settled");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMarket_season_teamId_key" ON "TournamentMarket"("season", "teamId");
