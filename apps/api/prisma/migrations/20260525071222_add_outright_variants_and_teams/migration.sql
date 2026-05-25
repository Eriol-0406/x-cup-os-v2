-- CreateTable
CREATE TABLE "Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "country" TEXT,
    "logo" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "groupLetter" TEXT,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TournamentSpecial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "season" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "groupLetter" TEXT,
    "marketId" INTEGER NOT NULL,
    "outcomeCount" INTEGER NOT NULL,
    "outcomesJson" TEXT NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "winningOutcome" INTEGER,
    "createMarketTx" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TournamentMarket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "season" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "teamName" TEXT NOT NULL,
    "teamLogo" TEXT NOT NULL,
    "teamCode" TEXT,
    "type" TEXT NOT NULL DEFAULT 'winner',
    "marketId" INTEGER NOT NULL,
    "outcomeCount" INTEGER NOT NULL DEFAULT 2,
    "createMarketTx" TEXT NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "winningOutcome" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_TournamentMarket" ("createMarketTx", "createdAt", "id", "marketId", "outcomeCount", "season", "settled", "teamCode", "teamId", "teamLogo", "teamName", "winningOutcome") SELECT "createMarketTx", "createdAt", "id", "marketId", "outcomeCount", "season", "settled", "teamCode", "teamId", "teamLogo", "teamName", "winningOutcome" FROM "TournamentMarket";
DROP TABLE "TournamentMarket";
ALTER TABLE "new_TournamentMarket" RENAME TO "TournamentMarket";
CREATE UNIQUE INDEX "TournamentMarket_marketId_key" ON "TournamentMarket"("marketId");
CREATE INDEX "TournamentMarket_season_idx" ON "TournamentMarket"("season");
CREATE INDEX "TournamentMarket_type_idx" ON "TournamentMarket"("type");
CREATE INDEX "TournamentMarket_settled_idx" ON "TournamentMarket"("settled");
CREATE UNIQUE INDEX "TournamentMarket_season_teamId_type_key" ON "TournamentMarket"("season", "teamId", "type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Team_season_idx" ON "Team"("season");

-- CreateIndex
CREATE INDEX "Team_groupLetter_idx" ON "Team"("groupLetter");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentSpecial_slug_key" ON "TournamentSpecial"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentSpecial_marketId_key" ON "TournamentSpecial"("marketId");

-- CreateIndex
CREATE INDEX "TournamentSpecial_season_idx" ON "TournamentSpecial"("season");

-- CreateIndex
CREATE INDEX "TournamentSpecial_type_idx" ON "TournamentSpecial"("type");

-- CreateIndex
CREATE INDEX "TournamentSpecial_groupLetter_idx" ON "TournamentSpecial"("groupLetter");
