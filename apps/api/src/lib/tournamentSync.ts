import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { fetchWCTeams } from "./teams.js";

/**
 * Pillar 1 — tournament-winner markets.
 *
 * One binary market per team: "Does <team> win the World Cup?" YES = idx 0,
 * NO = idx 1. Settled by the oracle when the tournament ends: the winning
 * team's market settles to outcome 0, all 31 losers settle to outcome 1.
 *
 * matchId pattern on-chain: "WC{season}-WINNER-{teamCode}" (recoverable from
 * the contract alone, no DB lookup required).
 *
 * closeTime: 30 days from creation. In production for a live WC, this would
 * be set to the start of the final (after the final kicks off, the tournament
 * outcome is essentially locked).
 */

export interface CreatedTournamentMarket {
  teamId: number;
  teamName: string;
  teamCode: string | null;
  marketId: number;
  txHash: string;
}

export async function createTournamentMarkets(): Promise<CreatedTournamentMarket[]> {
  if (!env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY not set — can't create tournament markets");
  }
  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const admin = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  const market = new ethers.Contract(
    deployment.contracts.XCupMarket.address,
    XCupMarketAbi as any,
    admin,
  ) as any;

  // 1. Fetch the team list (cached, will hit API only if cache expired).
  const teams = await fetchWCTeams();

  // 2. Skip teams that already have a market for this season.
  const existing = await prisma.tournamentMarket.findMany({
    where: { season: env.WC_SEASON },
    select: { teamId: true },
  });
  const existingIds = new Set(existing.map((e) => e.teamId));
  const toCreate = teams.filter((t) => !existingIds.has(t.id));

  // closeTime: 30 days out. WC 2022 already finished but for the on-chain
  // contract the close just needs to be in the future to accept stakes.
  const closeTime = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

  const created: CreatedTournamentMarket[] = [];
  for (const t of toCreate) {
    const code = t.code ?? t.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    const matchId = `WC${env.WC_SEASON}-WINNER-${code}`;
    try {
      const tx = await market.createMarket(matchId, 2, closeTime);
      const receipt = await tx.wait();

      // Parse MarketCreated to extract marketId
      const log = receipt.logs.find((l: any) => {
        try {
          const parsed = market.interface.parseLog(l);
          return parsed?.name === "MarketCreated";
        } catch {
          return false;
        }
      });
      if (!log) throw new Error("MarketCreated event missing in receipt");
      const parsed = market.interface.parseLog(log);
      const marketId = Number(parsed!.args.marketId);

      await prisma.tournamentMarket.create({
        data: {
          season: env.WC_SEASON,
          teamId: t.id,
          teamName: t.name,
          teamLogo: t.logo,
          teamCode: t.code,
          marketId,
          createMarketTx: receipt.hash,
        },
      });
      created.push({ teamId: t.id, teamName: t.name, teamCode: t.code, marketId, txHash: receipt.hash });
    } catch (err: any) {
      console.error(
        `[createTournamentMarkets] team ${t.name} (${t.id}) failed:`,
        err?.shortMessage ?? err?.message ?? err,
      );
    }
  }

  return created;
}

/**
 * End-of-tournament settle. Sets the winning team's market to outcome 0 (YES)
 * and every other team's market to outcome 1 (NO). Idempotent — re-running
 * skips already-settled markets.
 *
 * Does NOT trigger auto-claim for stakers — they call claim() themselves
 * from the UI (or we add an auto-claim sweep later). Keeping settle and
 * claim separate here because there could be hundreds of stakers across
 * 32 markets and we don't want to gas-bill the deployer for all of them.
 */
export interface SettleTournamentResult {
  settled: number;
  alreadySettled: number;
  failed: number;
  winningTeam: string;
}

export async function settleTournament(winningTeamId: number): Promise<SettleTournamentResult> {
  if (!env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY not set");
  }
  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const oracle = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  const market = new ethers.Contract(
    deployment.contracts.XCupMarket.address,
    XCupMarketAbi as any,
    oracle,
  ) as any;

  const rows = await prisma.tournamentMarket.findMany({
    where: { season: env.WC_SEASON },
  });
  const winningRow = rows.find((r) => r.teamId === winningTeamId);
  if (!winningRow) throw new Error(`No tournament market for teamId ${winningTeamId}`);

  let settled = 0;
  let alreadySettled = 0;
  let failed = 0;

  for (const r of rows) {
    if (r.settled) {
      alreadySettled++;
      continue;
    }
    const outcomeIdx = r.teamId === winningTeamId ? 0 : 1; // 0 = YES wins, 1 = NO wins
    try {
      const tx = await market.settle(r.marketId, outcomeIdx);
      await tx.wait();
      await prisma.tournamentMarket.update({
        where: { id: r.id },
        data: { settled: true, winningOutcome: outcomeIdx },
      });
      settled++;
    } catch (err: any) {
      console.error(
        `[settleTournament] team ${r.teamName} market ${r.marketId} failed:`,
        err?.shortMessage ?? err?.message ?? err,
      );
      failed++;
    }
  }

  return {
    settled,
    alreadySettled,
    failed,
    winningTeam: winningRow.teamName,
  };
}
