-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mainWallet" TEXT NOT NULL,
    "agentWallet" TEXT,
    "agentWalletEncryptedKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "englishText" TEXT NOT NULL,
    "parsedJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "maxLossUsdc" REAL,
    "currentPnlUsdc" REAL NOT NULL DEFAULT 0,
    "fireCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_mainWallet_key" ON "User"("mainWallet");

-- CreateIndex
CREATE UNIQUE INDEX "User_agentWallet_key" ON "User"("agentWallet");

-- CreateIndex
CREATE INDEX "Strategy_userId_idx" ON "Strategy"("userId");

-- CreateIndex
CREATE INDEX "Strategy_status_idx" ON "Strategy"("status");
