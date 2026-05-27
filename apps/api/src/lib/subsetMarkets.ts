import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { fetchTopScorers } from "./apiFootball.js";
import { MarketFees } from "./marketFees.js";

/**
 * Per-fixture sub-markets beyond match-winner (1x2):
 *   - Over/Under 2.5 goals (binary, idx 0 = Over, 1 = Under)
 *   - Both Teams To Score (binary, idx 0 = YES, 1 = NO)
 *
 * Both are reused via the existing PlayerPropMarket table with a different
 * `type` value. closeTime is the same 7-day demo window as the main fixture
 * market.
 */

function adminContract() {
  if (!env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const admin = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  return new ethers.Contract(deployment.contracts.XCupMarket.address, XCupMarketAbi as any, admin) as any;
}

async function createOnChainMarket(
  market: any,
  matchId: string,
  outcomeCount: number,
  closeTime: number,
  feeBps: number,
) {
  const tx = await market.createMarket(matchId, outcomeCount, closeTime, feeBps);
  const receipt = await tx.wait();
  const log = receipt.logs.find((l: any) => {
    try {
      const parsed = market.interface.parseLog(l);
      return parsed?.name === "MarketCreated";
    } catch {
      return false;
    }
  });
  if (!log) throw new Error("MarketCreated event not found");
  const parsed = market.interface.parseLog(log);
  return { marketId: Number(parsed!.args.marketId), txHash: receipt.hash };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CreatedSubMarket {
  fixtureId: number;
  type: string;
  marketId: number;
  txHash: string;
}

/** Helper that loops fixtures and creates one binary market each with the given type+outcomes. */
async function createPerFixtureBinary(
  type: string,
  outcomeLabels: [string, string],
  feeBps: number,
): Promise<{ created: CreatedSubMarket[]; skipped: number; failed: number }> {
  const fixtures = await prisma.fixture.findMany({
    include: { playerProps: true },
    orderBy: { date: "asc" },
  });

  const market = adminContract();
  const created: CreatedSubMarket[] = [];
  let skipped = 0;
  let failed = 0;

  for (const f of fixtures) {
    if (f.playerProps.some((p) => p.type === type)) {
      skipped++;
      continue;
    }
    const matchId = `WC${env.WC_SEASON}-${f.id}-${type}`;
    const closeTime = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    try {
      const { marketId, txHash } = await createOnChainMarket(market, matchId, 2, closeTime, feeBps);
      await prisma.playerPropMarket.create({
        data: {
          fixtureId: f.id,
          type,
          marketId,
          outcomeCount: 2,
          outcomesJson: JSON.stringify([
            { idx: 0, label: outcomeLabels[0] },
            { idx: 1, label: outcomeLabels[1] },
          ]),
          createMarketTx: txHash,
        },
      });
      created.push({ fixtureId: f.id, type, marketId, txHash });
    } catch (err: any) {
      console.error(`[${type}] fixture ${f.id} failed:`, err?.shortMessage ?? err?.message ?? err);
      failed++;
    }
    // Brief pause — gives the RPC time to mine, prevents nonce races.
    await sleep(500);
  }
  return { created, skipped, failed };
}

export async function createOverUnderMarkets() {
  return createPerFixtureBinary("over_under_25", ["Over 2.5", "Under 2.5"], MarketFees.OVER_UNDER_25);
}

export async function createBTTSMarkets() {
  return createPerFixtureBinary("btts", ["YES — both teams score", "NO — at least one team blanks"], MarketFees.BTTS);
}

/**
 * Per-team "To Reach Final" markets. One binary per team — YES if the team
 * reaches the WC Final, NO otherwise. Reuses TournamentMarket with type=
 * "to_reach_final".
 */
export async function createToReachFinalMarkets(): Promise<CreatedSubMarket[]> {
  const teams = await prisma.team.findMany({ where: { season: env.WC_SEASON } });
  const market = adminContract();

  // Skip teams that already have this market type
  const existing = await prisma.tournamentMarket.findMany({
    where: { season: env.WC_SEASON, type: "to_reach_final" },
    select: { teamId: true },
  });
  const skip = new Set(existing.map((e) => e.teamId));

  const created: CreatedSubMarket[] = [];
  const closeTime = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

  for (const t of teams) {
    if (skip.has(t.id)) continue;
    const code = t.code ?? t.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    const matchId = `WC${env.WC_SEASON}-FINAL-${code}`;
    try {
      const { marketId, txHash } = await createOnChainMarket(market, matchId, 2, closeTime, MarketFees.TO_REACH_FINAL);
      await prisma.tournamentMarket.create({
        data: {
          season: env.WC_SEASON,
          teamId: t.id,
          teamName: t.name,
          teamLogo: t.logo,
          teamCode: t.code,
          type: "to_reach_final",
          marketId,
          createMarketTx: txHash,
        },
      });
      created.push({ fixtureId: t.id, type: "to_reach_final", marketId, txHash });
    } catch (err: any) {
      console.error(`[to_reach_final] team ${t.id} failed:`, err?.shortMessage ?? err?.message ?? err);
    }
    await sleep(500);
  }
  return created;
}

/**
 * Top Goalscorer market — one multi-outcome market with N candidate players
 * pulled from /players/topscorers (top N by current goal count) + an "Other"
 * bucket. Capped at XCupMarket's 8-outcome max. Settled manually.
 */
export async function createTopScorerMarket(): Promise<CreatedSubMarket | { skipped: true; reason: string }> {
  const existing = await prisma.tournamentSpecial.findUnique({
    where: { slug: `top-scorer-${env.WC_SEASON}` },
  });
  if (existing) return { skipped: true, reason: "already exists" };

  const scorers = await fetchTopScorers();
  if (scorers.length === 0) return { skipped: true, reason: "no scorers data" };

  // Take top 7 + "Other / no goal"
  const top = scorers.slice(0, 7);
  const outcomes = [
    ...top.map((s, i) => ({
      idx: i,
      label: s.player.name,
      teamId: s.statistics?.[0]?.team?.id ?? null,
      playerName: s.player.name,
      photo: s.player.photo,
    })),
    { idx: top.length, label: "Other" },
  ];

  const market = adminContract();
  const matchId = `WC${env.WC_SEASON}-TOPSCORER`;
  const closeTime = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  const { marketId, txHash } = await createOnChainMarket(market, matchId, outcomes.length, closeTime, MarketFees.TOP_SCORER);

  await prisma.tournamentSpecial.create({
    data: {
      season: env.WC_SEASON,
      slug: `top-scorer-${env.WC_SEASON}`,
      question: `Top Goalscorer — WC ${env.WC_SEASON}`,
      type: "top_scorer",
      groupLetter: null,
      marketId,
      outcomeCount: outcomes.length,
      outcomesJson: JSON.stringify(outcomes),
      createMarketTx: txHash,
    },
  });
  return { fixtureId: 0, type: "top_scorer", marketId, txHash };
}

/**
 * Per-group winner markets — one multi-outcome market per group, outcomes are
 * the 4 teams in that group. Reuses TournamentSpecial with type="group_winner".
 */
export async function createGroupWinnerMarkets(): Promise<CreatedSubMarket[]> {
  const teams = await prisma.team.findMany({
    where: { season: env.WC_SEASON, groupLetter: { not: null } },
  });

  // Group by letter
  const byGroup: Record<string, typeof teams> = {};
  for (const t of teams) {
    const g = t.groupLetter!;
    (byGroup[g] ??= []).push(t);
  }

  // Skip groups that already have a winner market
  const existing = await prisma.tournamentSpecial.findMany({
    where: { season: env.WC_SEASON, type: "group_winner" },
    select: { groupLetter: true },
  });
  const skip = new Set(existing.map((e) => e.groupLetter ?? ""));

  const market = adminContract();
  const closeTime = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  const created: CreatedSubMarket[] = [];

  for (const letter of Object.keys(byGroup).sort()) {
    if (skip.has(letter)) continue;
    const groupTeams = byGroup[letter];
    if (!groupTeams || groupTeams.length === 0) continue;
    const outcomes = groupTeams.map((t, idx) => ({
      idx,
      label: t.name,
      teamId: t.id,
      teamLogo: t.logo,
    }));
    const matchId = `WC${env.WC_SEASON}-GROUP-${letter}-WINNER`;
    try {
      const { marketId, txHash } = await createOnChainMarket(market, matchId, outcomes.length, closeTime, MarketFees.GROUP_WINNER);
      await prisma.tournamentSpecial.create({
        data: {
          season: env.WC_SEASON,
          slug: `group-${letter.toLowerCase()}-winner-${env.WC_SEASON}`,
          question: `Group ${letter} Winner`,
          type: "group_winner",
          groupLetter: letter,
          marketId,
          outcomeCount: outcomes.length,
          outcomesJson: JSON.stringify(outcomes),
          createMarketTx: txHash,
        },
      });
      created.push({ fixtureId: 0, type: `group_${letter.toLowerCase()}_winner`, marketId, txHash });
    } catch (err: any) {
      console.error(`[group_winner] group ${letter} failed:`, err?.shortMessage ?? err?.message ?? err);
    }
    await sleep(500);
  }
  return created;
}
