-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Strategy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "englishText" TEXT NOT NULL,
    "parsedJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "maxLossUsdc" REAL,
    "currentPnlUsdc" REAL NOT NULL DEFAULT 0,
    "fireCount" INTEGER NOT NULL DEFAULT 0,
    "targetMarketIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Strategy" ("createdAt", "currentPnlUsdc", "englishText", "fireCount", "id", "maxLossUsdc", "parsedJson", "status", "updatedAt", "userId") SELECT "createdAt", "currentPnlUsdc", "englishText", "fireCount", "id", "maxLossUsdc", "parsedJson", "status", "updatedAt", "userId" FROM "Strategy";
DROP TABLE "Strategy";
ALTER TABLE "new_Strategy" RENAME TO "Strategy";
CREATE INDEX "Strategy_userId_idx" ON "Strategy"("userId");
CREATE INDEX "Strategy_status_idx" ON "Strategy"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
