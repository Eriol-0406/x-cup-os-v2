-- CreateTable
CREATE TABLE "PredictionMarket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Tournament',
    "season" INTEGER NOT NULL,
    "marketId" INTEGER NOT NULL,
    "createMarketTx" TEXT NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "winningOutcome" INTEGER,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "allowlistJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "PredictionMarket_slug_key" ON "PredictionMarket"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionMarket_marketId_key" ON "PredictionMarket"("marketId");

-- CreateIndex
CREATE INDEX "PredictionMarket_season_idx" ON "PredictionMarket"("season");

-- CreateIndex
CREATE INDEX "PredictionMarket_settled_idx" ON "PredictionMarket"("settled");

-- CreateIndex
CREATE INDEX "PredictionMarket_category_idx" ON "PredictionMarket"("category");
