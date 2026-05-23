-- CreateTable
CREATE TABLE "StrategyFire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyId" TEXT NOT NULL,
    "marketId" INTEGER NOT NULL,
    "outcomeIdx" INTEGER NOT NULL,
    "stakeUsdc" REAL NOT NULL,
    "txHash" TEXT,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "matchEventJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategyFire_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StrategyFire_strategyId_idx" ON "StrategyFire"("strategyId");

-- CreateIndex
CREATE INDEX "StrategyFire_status_idx" ON "StrategyFire"("status");
