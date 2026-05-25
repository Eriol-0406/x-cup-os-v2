-- CreateTable
CREATE TABLE "PlayerPropMarket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fixtureId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "marketId" INTEGER NOT NULL,
    "outcomeCount" INTEGER NOT NULL,
    "outcomesJson" TEXT NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "winningOutcome" INTEGER,
    "createMarketTx" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerPropMarket_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPropMarket_marketId_key" ON "PlayerPropMarket"("marketId");

-- CreateIndex
CREATE INDEX "PlayerPropMarket_type_idx" ON "PlayerPropMarket"("type");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPropMarket_fixtureId_type_key" ON "PlayerPropMarket"("fixtureId", "type");
