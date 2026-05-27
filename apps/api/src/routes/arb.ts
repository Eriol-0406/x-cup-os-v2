import { Router } from "express";
import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";

export const arbRouter = Router();

type Implied = {
  marketId: number;
  settled: boolean;
  yesProb: number;
  totalPotUsdc: number;
};

type TeamData = {
  teamId: number;
  teamName: string;
  teamLogo: string;
  teamCode: string | null;
  winner?: Implied;
  reachFinal?: Implied;
};

/**
 * GET /arb-signals — scan related markets for price inconsistencies the pool
 * has gotten wrong relative to basic logical constraints between outcomes.
 *
 * Signal kinds (v1 surface):
 *   - winner_vs_reach_final  Per team. Winning the cup implies reaching the
 *                            final, so P(winner) MUST ≤ P(reach_final). Any
 *                            team violating this represents a guaranteed-edge
 *                            two-leg position (NO on winner + YES on final).
 *   - winner_sum_anomaly     Global. Exactly one team wins, so summed implied
 *                            P(winner) across all liquid teams should ≈ 1.00.
 *   - reach_final_sum_anomaly Global. Exactly two teams reach the final, so
 *                            summed P(reach_final) should ≈ 2.00.
 *
 * The frontend renders these as cards on /arb with a "view markets" link.
 * Honest framing: we surface the signal, we don't auto-execute — the
 * capital-efficient size depends on parimutuel pool depth.
 */
arbRouter.get("/", async (_req, res) => {
  try {
    const deployment = getDeployment(env.XLAYER_CHAIN_ID);
    const provider = new ethers.JsonRpcProvider(deployment.rpc);
    const market = new ethers.Contract(
      deployment.contracts.XCupMarket.address,
      XCupMarketAbi as any,
      provider,
    ) as any;

    const rows = await prisma.tournamentMarket.findMany({
      where: {
        season: env.WC_SEASON,
        type: { in: ["winner", "to_reach_final"] },
      },
    });

    const byTeam = new Map<number, TeamData>();
    await Promise.all(
      rows.map(async (r) => {
        let yesPot = 0n;
        let noPot = 0n;
        try {
          [yesPot, noPot] = await Promise.all([
            market.getOutcomePot(r.marketId, 0) as Promise<bigint>,
            market.getOutcomePot(r.marketId, 1) as Promise<bigint>,
          ]);
        } catch {
          // RPC blip — treat as no liquidity
        }
        const total = yesPot + noPot;
        const implied: Implied = {
          marketId: r.marketId,
          settled: r.settled,
          yesProb: total > 0n ? Number(yesPot) / Number(total) : 0,
          totalPotUsdc: Number(ethers.formatUnits(total, 6)),
        };
        let td = byTeam.get(r.teamId);
        if (!td) {
          td = {
            teamId: r.teamId,
            teamName: r.teamName,
            teamLogo: r.teamLogo,
            teamCode: r.teamCode,
          };
          byTeam.set(r.teamId, td);
        }
        if (r.type === "winner") td.winner = implied;
        else if (r.type === "to_reach_final") td.reachFinal = implied;
      }),
    );

    const winnerVsRf: any[] = [];
    let sumWinner = 0;
    let sumReachFinal = 0;
    let nWinner = 0;
    let nReachFinal = 0;

    for (const td of byTeam.values()) {
      if (td.winner && !td.winner.settled && td.winner.totalPotUsdc > 0) {
        sumWinner += td.winner.yesProb;
        nWinner++;
      }
      if (td.reachFinal && !td.reachFinal.settled && td.reachFinal.totalPotUsdc > 0) {
        sumReachFinal += td.reachFinal.yesProb;
        nReachFinal++;
      }

      if (!td.winner || !td.reachFinal) continue;
      if (td.winner.settled || td.reachFinal.settled) continue;
      if (td.winner.totalPotUsdc === 0 || td.reachFinal.totalPotUsdc === 0) continue;

      const gap = td.winner.yesProb - td.reachFinal.yesProb;
      if (gap > 0.01) {
        winnerVsRf.push({
          type: "winner_vs_reach_final",
          team: { id: td.teamId, name: td.teamName, logo: td.teamLogo, code: td.teamCode },
          winner: td.winner,
          reachFinal: td.reachFinal,
          gap,
          explanation: `${td.teamName} tournament-winner implied probability (${(td.winner.yesProb * 100).toFixed(1)}%) exceeds reach-final probability (${(td.reachFinal.yesProb * 100).toFixed(1)}%). Winning the cup mathematically implies reaching the final, so winner ≤ reach-final must hold — the pool has mispriced one side.`,
          arbAction: `Buy NO on tournament-winner market #${td.winner.marketId} and YES on reach-final market #${td.reachFinal.marketId}.`,
        });
      }
    }
    winnerVsRf.sort((a, b) => b.gap - a.gap);

    const globalSignals: any[] = [];
    if (nWinner >= 2 && Math.abs(sumWinner - 1.0) > 0.15) {
      globalSignals.push({
        type: "winner_sum_anomaly",
        sum: Number(sumWinner.toFixed(4)),
        expected: 1.0,
        teamsWithLiquidity: nWinner,
        explanation: `Implied tournament-winner probabilities across all ${nWinner} liquid teams sum to ${sumWinner.toFixed(2)} (should ≈ 1.00). ${
          sumWinner > 1.0
            ? "The pool collectively overpays YES — favor NO bets on teams with the largest YES pots."
            : "The pool collectively underpays YES — there is unclaimed edge on YES across the board."
        }`,
      });
    }
    if (nReachFinal >= 2 && Math.abs(sumReachFinal - 2.0) > 0.20) {
      globalSignals.push({
        type: "reach_final_sum_anomaly",
        sum: Number(sumReachFinal.toFixed(4)),
        expected: 2.0,
        teamsWithLiquidity: nReachFinal,
        explanation: `Implied reach-final probabilities across all ${nReachFinal} liquid teams sum to ${sumReachFinal.toFixed(2)} (should ≈ 2.00 since exactly two teams reach the final).`,
      });
    }

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      signals: {
        winnerVsReachFinal: winnerVsRf,
        global: globalSignals,
      },
      stats: {
        teamsScanned: byTeam.size,
        winnerMarketsWithLiquidity: nWinner,
        reachFinalMarketsWithLiquidity: nReachFinal,
        sumWinner: Number(sumWinner.toFixed(4)),
        sumReachFinal: Number(sumReachFinal.toFixed(4)),
      },
    });
  } catch (err: any) {
    console.error("[GET /arb-signals]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});
