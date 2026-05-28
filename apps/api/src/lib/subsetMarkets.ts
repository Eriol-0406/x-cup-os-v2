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
    where: { season: env.WC_SEASON },
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
 * Pre-tournament favorites used when the API returns no real top-scorer data
 * (i.e. the tournament hasn't started yet, so nobody has scored). Lets us
 * seed a bettable market BEFORE kickoff with well-known goal-favorites per
 * season. Once real goals start landing, the existing market sticks with the
 * frozen outcome list — that's fine, bookmakers do the same thing.
 *
 * Update this map when the WC season changes. Photos use API-Football's
 * media CDN (stable across seasons for known players).
 */
const PRE_TOURNAMENT_TOP_SCORER_FAVORITES: Record<
  number,
  Array<{ name: string; photo?: string; teamHint: string }>
> = {
  2022: [
    { name: "Lionel Messi", teamHint: "Argentina", photo: "https://media.api-sports.io/football/players/154.png" },
    { name: "Kylian Mbappé", teamHint: "France", photo: "https://media.api-sports.io/football/players/278.png" },
    { name: "Neymar", teamHint: "Brazil", photo: "https://media.api-sports.io/football/players/276.png" },
    { name: "Harry Kane", teamHint: "England", photo: "https://media.api-sports.io/football/players/184.png" },
    { name: "Karim Benzema", teamHint: "France", photo: "https://media.api-sports.io/football/players/521.png" },
    { name: "Robert Lewandowski", teamHint: "Poland", photo: "https://media.api-sports.io/football/players/521.png" },
    { name: "Cristiano Ronaldo", teamHint: "Portugal", photo: "https://media.api-sports.io/football/players/874.png" },
  ],
  2026: [
    { name: "Kylian Mbappé", teamHint: "France", photo: "https://media.api-sports.io/football/players/278.png" },
    { name: "Erling Haaland", teamHint: "Norway", photo: "https://media.api-sports.io/football/players/1100.png" },
    { name: "Vinícius Júnior", teamHint: "Brazil", photo: "https://media.api-sports.io/football/players/2932.png" },
    { name: "Jude Bellingham", teamHint: "England", photo: "https://media.api-sports.io/football/players/19220.png" },
    { name: "Lautaro Martínez", teamHint: "Argentina", photo: "https://media.api-sports.io/football/players/342.png" },
    { name: "Harry Kane", teamHint: "England", photo: "https://media.api-sports.io/football/players/184.png" },
    { name: "Lamine Yamal", teamHint: "Spain", photo: "https://media.api-sports.io/football/players/47380.png" },
  ],
};

/**
 * Top Goalscorer market — one multi-outcome market with N candidate players +
 * an "Other" bucket. Capped at XCupMarket's 8-outcome max. Settled manually
 * by the admin oracle at tournament end.
 *
 * Data source order:
 *   1. API-Football /players/topscorers — used mid/post-tournament when real
 *      goals exist. Outcomes are the actual top-7 by goal count.
 *   2. Pre-tournament favorites table above — used when API returns nothing
 *      (the tournament hasn't started). Outcomes are well-known forwards
 *      so users have something to bet on from day one.
 */
export async function createTopScorerMarket(): Promise<CreatedSubMarket | { skipped: true; reason: string }> {
  const existing = await prisma.tournamentSpecial.findUnique({
    where: { slug: `top-scorer-${env.WC_SEASON}` },
  });
  if (existing) return { skipped: true, reason: "already exists" };

  type Outcome = { idx: number; label: string; teamId?: number | null; playerName: string; photo?: string };
  let outcomes: Outcome[];

  const scorers = await fetchTopScorers();
  if (scorers.length > 0) {
    // Real tournament data — use the live top 7
    const top = scorers.slice(0, 7);
    outcomes = [
      ...top.map((s, i) => ({
        idx: i,
        label: s.player.name,
        teamId: s.statistics?.[0]?.team?.id ?? null,
        playerName: s.player.name,
        photo: s.player.photo,
      })),
      { idx: top.length, label: "Other", playerName: "Other" },
    ];
  } else {
    // Pre-tournament — fall back to favorites table
    const favorites = PRE_TOURNAMENT_TOP_SCORER_FAVORITES[env.WC_SEASON];
    if (!favorites || favorites.length === 0) {
      return { skipped: true, reason: `no scorers data and no pre-tournament favorites configured for season ${env.WC_SEASON}` };
    }
    outcomes = [
      ...favorites.map((f, i) => ({
        idx: i,
        label: `${f.name} (${f.teamHint})`,
        teamId: null,
        playerName: f.name,
        photo: f.photo,
      })),
      { idx: favorites.length, label: "Other / unlisted scorer", playerName: "Other" },
    ];
  }

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
