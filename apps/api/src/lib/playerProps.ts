import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { fetchFixture, type ApiFixtureRaw, type ApiFixtureEvent } from "./apiFootball.js";
import { MarketFees } from "./marketFees.js";

/**
 * Per-fixture player-prop markets — currently only "first goal scorer".
 *
 * For each fixture we want to create a market with outcomes:
 *   idx 0..N-1: top N distinct goal scorers (capped at 7 to fit the contract's
 *               8-outcome ceiling)
 *   idx N:      "Other or no scorer" catch-all
 *
 * Settled by the replay flow with the actual first scorer (the earliest
 * "Goal" event in fixture.events).
 *
 * matchId on-chain: "WC{season}-FS-{fixtureId}"
 */

export interface PropOutcome {
  idx: number;
  label: string;
  playerName?: string;
  teamName?: string;
}

export interface CreatedPropMarket {
  fixtureId: number;
  marketId: number;
  outcomeCount: number;
  outcomes: PropOutcome[];
  txHash: string;
}

/**
 * Extract the first goal scorer + the full ordered list of distinct scorers
 * from a fixture's events. Returns null if no goals (0-0 or events missing).
 */
export function extractFirstScorer(f: ApiFixtureRaw): {
  first: string;
  team: string;
  distinctScorers: { player: string; team: string }[];
} | null {
  if (!f.events) return null;
  const goals = f.events
    .filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty")
    .filter((e) => !!e.player?.name)
    .sort((a, b) => a.time.elapsed - b.time.elapsed);
  if (goals.length === 0) return null;

  const distinct: { player: string; team: string }[] = [];
  for (const g of goals) {
    const name = g.player.name!;
    if (!distinct.find((d) => d.player === name)) {
      distinct.push({ player: name, team: g.team.name });
    }
  }
  return {
    first: distinct[0]!.player,
    team: distinct[0]!.team,
    distinctScorers: distinct,
  };
}

/**
 * Build the outcomes list for a fixture's first-scorer market. Caps at
 * 7 named players + 1 "Other / no scorer" bucket = 8 outcomes total.
 */
function buildFirstScorerOutcomes(scorers: { player: string; team: string }[]): PropOutcome[] {
  const top = scorers.slice(0, 7);
  const outcomes: PropOutcome[] = top.map((s, i) => ({
    idx: i,
    label: s.player,
    playerName: s.player,
    teamName: s.team,
  }));
  outcomes.push({ idx: outcomes.length, label: "Other / no goal" });
  return outcomes;
}

/**
 * Pull events for a single fixture (1 API call) and create the first-scorer
 * market on-chain + persist the mapping. Idempotent — skips fixtures that
 * already have a first_scorer PlayerPropMarket.
 *
 * fixtureIds: optional whitelist (e.g. just knockouts). If empty, processes
 * every finished fixture that doesn't already have a market.
 */
export async function createFirstScorerMarkets(opts: {
  fixtureIds?: number[];
  limit?: number;
}): Promise<{ created: CreatedPropMarket[]; skipped: number; failed: number }> {
  if (!env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const admin = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  const market = new ethers.Contract(
    deployment.contracts.XCupMarket.address,
    XCupMarketAbi as any,
    admin,
  ) as any;

  // Pick fixtures: finished, optionally filtered, and not yet mapped.
  const where: any = { status: { in: ["FT", "AET", "PEN"] } };
  if (opts.fixtureIds && opts.fixtureIds.length > 0) where.id = { in: opts.fixtureIds };
  const fixtures = await prisma.fixture.findMany({
    where,
    take: opts.limit ?? 30,
    orderBy: { date: "asc" },
    include: { playerProps: { where: { type: "first_scorer" } } },
  });

  const created: CreatedPropMarket[] = [];
  let skipped = 0;
  let failed = 0;

  // closeTime: 7 days out (same convention as fixture markets for historical replay)
  const closeTime = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

  // Free tier is 10 req/min — pace ourselves at 1 req per ~7s to stay safely
  // under the limit even if there's other concurrent traffic.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let firstRequest = true;

  for (const f of fixtures) {
    if (f.playerProps.length > 0) {
      skipped++;
      continue;
    }

    try {
      if (!firstRequest) await sleep(7_000);
      firstRequest = false;
      // Fetch fresh events (1 API call per fixture, in-memory cached for 1h)
      const fresh = await fetchFixture(f.id);
      if (!fresh) {
        failed++;
        continue;
      }
      const result = extractFirstScorer(fresh);
      if (!result || result.distinctScorers.length === 0) {
        // 0-0 or no parseable goals — skip
        skipped++;
        continue;
      }

      const outcomes = buildFirstScorerOutcomes(result.distinctScorers);
      const onChainMatchId = `WC${env.WC_SEASON}-FS-${f.id}`;
      const tx = await market.createMarket(onChainMatchId, outcomes.length, closeTime, MarketFees.FIRST_SCORER);
      const receipt = await tx.wait();

      const log = receipt.logs.find((l: any) => {
        try {
          const parsed = market.interface.parseLog(l);
          return parsed?.name === "MarketCreated";
        } catch {
          return false;
        }
      });
      if (!log) throw new Error("MarketCreated event not in receipt");
      const parsed = market.interface.parseLog(log);
      const marketId = Number(parsed!.args.marketId);

      await prisma.playerPropMarket.create({
        data: {
          fixtureId: f.id,
          type: "first_scorer",
          marketId,
          outcomeCount: outcomes.length,
          outcomesJson: JSON.stringify(outcomes),
          createMarketTx: receipt.hash,
        },
      });
      created.push({
        fixtureId: f.id,
        marketId,
        outcomeCount: outcomes.length,
        outcomes,
        txHash: receipt.hash,
      });
    } catch (err: any) {
      console.error(
        `[createFirstScorerMarkets] fixture ${f.id} failed:`,
        err?.shortMessage ?? err?.message ?? err,
      );
      failed++;
    }
  }

  return { created, skipped, failed };
}

/**
 * Settle a fixture's first-scorer market with the actual first goal scorer.
 * Called from the replay flow after the fixture has been pulled fresh.
 * Returns the settlement result.
 */
export async function settleFirstScorerMarket(
  fixtureId: number,
  fresh: ApiFixtureRaw,
): Promise<{ ok: boolean; reason?: string; txHash?: string; winningOutcome?: number; winningPlayer?: string }> {
  const ppm = await prisma.playerPropMarket.findUnique({
    where: { fixtureId_type: { fixtureId, type: "first_scorer" } },
  });
  if (!ppm) return { ok: false, reason: "no first_scorer market for this fixture" };
  if (ppm.settled) {
    return { ok: true, reason: "already settled", winningOutcome: ppm.winningOutcome ?? undefined };
  }

  const result = extractFirstScorer(fresh);
  if (!result) return { ok: false, reason: "no goals parsed from events" };

  const outcomes = JSON.parse(ppm.outcomesJson) as PropOutcome[];
  const matchIdx = outcomes.findIndex((o) => o.playerName === result.first);
  const winningOutcome = matchIdx >= 0 ? matchIdx : outcomes.length - 1; // "Other" bucket

  if (!env.DEPLOYER_PRIVATE_KEY) return { ok: false, reason: "no DEPLOYER_PRIVATE_KEY" };
  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const oracle = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  const market = new ethers.Contract(
    deployment.contracts.XCupMarket.address,
    XCupMarketAbi as any,
    oracle,
  ) as any;

  try {
    const tx = await market.settle(ppm.marketId, winningOutcome);
    const receipt = await tx.wait();
    await prisma.playerPropMarket.update({
      where: { id: ppm.id },
      data: { settled: true, winningOutcome },
    });
    return { ok: true, txHash: receipt.hash, winningOutcome, winningPlayer: result.first };
  } catch (err: any) {
    return { ok: false, reason: err?.shortMessage ?? err?.message ?? String(err) };
  }
}
