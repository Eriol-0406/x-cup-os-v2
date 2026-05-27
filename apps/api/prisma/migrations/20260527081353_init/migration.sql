-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "mainWallet" TEXT NOT NULL,
    "agentWallet" TEXT,
    "agentWalletEncryptedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "englishText" TEXT NOT NULL,
    "parsedJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "maxLossUsdc" DOUBLE PRECISION,
    "currentPnlUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fireCount" INTEGER NOT NULL DEFAULT 0,
    "targetMarketIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyFire" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "marketId" INTEGER NOT NULL,
    "outcomeIdx" INTEGER NOT NULL,
    "stakeUsdc" DOUBLE PRECISION NOT NULL,
    "txHash" TEXT,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "matchEventJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyFire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "country" TEXT,
    "logo" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "groupLetter" TEXT,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixtureMarket" (
    "fixtureId" INTEGER NOT NULL,
    "marketId" INTEGER NOT NULL,
    "outcomeCount" INTEGER NOT NULL,
    "createMarketTx" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixtureMarket_pkey" PRIMARY KEY ("fixtureId")
);

-- CreateTable
CREATE TABLE "PredictionMarket" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPropMarket" (
    "id" TEXT NOT NULL,
    "fixtureId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "marketId" INTEGER NOT NULL,
    "outcomeCount" INTEGER NOT NULL,
    "outcomesJson" TEXT NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "winningOutcome" INTEGER,
    "createMarketTx" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerPropMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMarket" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentSpecial" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentSpecial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "marketId" INTEGER NOT NULL,
    "payoutUsdc" DOUBLE PRECISION NOT NULL,
    "txHash" TEXT,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_mainWallet_key" ON "User"("mainWallet");

-- CreateIndex
CREATE UNIQUE INDEX "User_agentWallet_key" ON "User"("agentWallet");

-- CreateIndex
CREATE INDEX "Strategy_userId_idx" ON "Strategy"("userId");

-- CreateIndex
CREATE INDEX "Strategy_status_idx" ON "Strategy"("status");

-- CreateIndex
CREATE INDEX "StrategyFire_strategyId_idx" ON "StrategyFire"("strategyId");

-- CreateIndex
CREATE INDEX "StrategyFire_status_idx" ON "StrategyFire"("status");

-- CreateIndex
CREATE INDEX "Team_season_idx" ON "Team"("season");

-- CreateIndex
CREATE INDEX "Team_groupLetter_idx" ON "Team"("groupLetter");

-- CreateIndex
CREATE INDEX "Fixture_status_idx" ON "Fixture"("status");

-- CreateIndex
CREATE INDEX "Fixture_date_idx" ON "Fixture"("date");

-- CreateIndex
CREATE INDEX "Fixture_round_idx" ON "Fixture"("round");

-- CreateIndex
CREATE UNIQUE INDEX "FixtureMarket_marketId_key" ON "FixtureMarket"("marketId");

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

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPropMarket_marketId_key" ON "PlayerPropMarket"("marketId");

-- CreateIndex
CREATE INDEX "PlayerPropMarket_type_idx" ON "PlayerPropMarket"("type");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPropMarket_fixtureId_type_key" ON "PlayerPropMarket"("fixtureId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMarket_marketId_key" ON "TournamentMarket"("marketId");

-- CreateIndex
CREATE INDEX "TournamentMarket_season_idx" ON "TournamentMarket"("season");

-- CreateIndex
CREATE INDEX "TournamentMarket_type_idx" ON "TournamentMarket"("type");

-- CreateIndex
CREATE INDEX "TournamentMarket_settled_idx" ON "TournamentMarket"("settled");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMarket_season_teamId_type_key" ON "TournamentMarket"("season", "teamId", "type");

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

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "Claim"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_strategyId_marketId_key" ON "Claim"("strategyId", "marketId");

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyFire" ADD CONSTRAINT "StrategyFire_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureMarket" ADD CONSTRAINT "FixtureMarket_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPropMarket" ADD CONSTRAINT "PlayerPropMarket_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
