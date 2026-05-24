import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";
import {
  fetchWorldCupFixtures,
  fixtureOutcomeCount,
  type ApiFixtureRaw,
} from "./apiFootball.js";

/**
 * Pull every fixture for the configured WC season from API-Football and upsert
 * them into the local Fixture table. Returns the count of rows touched.
 *
 * Designed to be called periodically (cron) AND on-demand (POST /admin/sync-fixtures).
 * Idempotent — re-running just refreshes scores/status without touching markets.
 */
export async function syncFixtures(): Promise<{ fetched: number; upserted: number }> {
  const fixtures = await fetchWorldCupFixtures();
  let upserted = 0;

  for (const f of fixtures) {
    const group = extractGroupFromRound(f.league.round);
    await prisma.fixture.upsert({
      where: { id: f.fixture.id },
      create: {
        id: f.fixture.id,
        date: new Date(f.fixture.date),
        status: f.fixture.status.short,
        round: f.league.round,
        homeTeamId: f.teams.home.id,
        homeTeamName: f.teams.home.name,
        homeTeamLogo: f.teams.home.logo,
        awayTeamId: f.teams.away.id,
        awayTeamName: f.teams.away.name,
        awayTeamLogo: f.teams.away.logo,
        homeGoals: f.goals.home,
        awayGoals: f.goals.away,
        penaltyHome: f.score?.penalty?.home ?? null,
        penaltyAway: f.score?.penalty?.away ?? null,
        venueName: f.fixture.venue.name,
        venueCity: f.fixture.venue.city,
        group,
        rawJson: JSON.stringify(f),
      },
      update: {
        status: f.fixture.status.short,
        homeGoals: f.goals.home,
        awayGoals: f.goals.away,
        penaltyHome: f.score?.penalty?.home ?? null,
        penaltyAway: f.score?.penalty?.away ?? null,
        rawJson: JSON.stringify(f),
      },
    });
    upserted++;
  }

  return { fetched: fixtures.length, upserted };
}

/** Round names look like "Group Stage - 1" / "Round of 16" / "Final". */
function extractGroupFromRound(round: string): string | null {
  // API-Football puts the group letter on each TEAM in /teams response, not on
  // the fixture round string. For v1 we leave this null and let the UI infer
  // group from the team logos / nominations if we need to.
  void round;
  return null;
}

/* -------------------------------------------------------------------------- */
/* On-chain market creation                                                    */
/* -------------------------------------------------------------------------- */

/**
 * For each Fixture without a FixtureMarket, call XCupMarket.createMarket with
 * the deployer (admin) and persist the mapping. Idempotent.
 *
 * matchId on-chain = "WC{season}-{fixtureId}" (stable, recoverable from chain alone).
 * outcomeCount = 3 for group-stage matches, 2 for knockouts.
 * closeTime = fixture kickoff (UTC). Users can't stake once the match starts.
 */
export interface CreatedMarket {
  fixtureId: number;
  marketId: number;
  txHash: string;
  outcomeCount: number;
}

export async function createMissingMarkets(maxToCreate?: number): Promise<CreatedMarket[]> {
  if (!env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY not set — can't create on-chain markets");
  }

  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const admin = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  const market = new ethers.Contract(
    deployment.contracts.XCupMarket.address,
    XCupMarketAbi as any,
    admin,
  ) as any;

  // For historical replay (WC 2022), the real fixture dates are in the past.
  // Contract requires closeTime > now, so we use a synthetic 7-day betting
  // window for the demo. When pointed at the live WC 2026 dataset, the
  // kickoff time would just be in the future and we'd use that directly.
  const unmapped = await prisma.fixture.findMany({
    where: { market: null },
    orderBy: { date: "asc" },
    take: maxToCreate ?? 100,
  });

  const results: CreatedMarket[] = [];
  for (const f of unmapped) {
    const matchId = `WC${env.WC_SEASON}-${f.id}`;
    const rawForCheck = JSON.parse(f.rawJson) as ApiFixtureRaw;
    const outcomeCount = fixtureOutcomeCount(rawForCheck);
    // Demo: 7-day betting window from now. For live WC fixtures use actual kickoff.
    const fixtureUnix = Math.floor(f.date.getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);
    const closeTime = fixtureUnix > nowUnix ? fixtureUnix : nowUnix + 7 * 24 * 3600;

    try {
      const tx = await market.createMarket(matchId, outcomeCount, closeTime);
      const receipt = await tx.wait();

      // Parse the MarketCreated event to get the marketId
      const log = receipt.logs.find((l: any) => {
        try {
          const parsed = market.interface.parseLog(l);
          return parsed?.name === "MarketCreated";
        } catch {
          return false;
        }
      });
      if (!log) throw new Error("MarketCreated event not found in receipt");
      const parsed = market.interface.parseLog(log);
      const marketId = Number(parsed!.args.marketId);

      await prisma.fixtureMarket.create({
        data: {
          fixtureId: f.id,
          marketId,
          outcomeCount,
          createMarketTx: receipt.hash,
        },
      });

      results.push({ fixtureId: f.id, marketId, txHash: receipt.hash, outcomeCount });
    } catch (err: any) {
      // Don't blow up the whole batch — log and continue.
      console.error(
        `[createMissingMarkets] fixture ${f.id} failed:`,
        err?.shortMessage ?? err?.message ?? err,
      );
    }
  }

  return results;
}
