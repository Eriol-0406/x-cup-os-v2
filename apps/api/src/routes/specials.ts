import { Router } from "express";
import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";

export const specialsRouter = Router();

/**
 * GET /tournament-specials — multi-outcome tournament-wide markets:
 *   - Top Goalscorer
 *   - Per-group winners (Group A Winner, Group B Winner, ...)
 *   - Best Young Player / Best Goalkeeper / etc.
 *
 * Each row is enriched with per-outcome on-chain pots so the UI can show
 * implied probabilities.
 *
 * Query: ?type=group_winner | top_scorer | best_young_player | ...
 */
specialsRouter.get("/", async (req, res) => {
  try {
    const typeFilter = req.query.type ? String(req.query.type) : undefined;
    const groupFilter = req.query.group ? String(req.query.group) : undefined;
    const rows = await prisma.tournamentSpecial.findMany({
      where: {
        season: env.WC_SEASON,
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(groupFilter ? { groupLetter: groupFilter } : {}),
      },
      orderBy: [{ type: "asc" }, { groupLetter: "asc" }],
    });
    if (rows.length === 0) return res.json({ ok: true, markets: [] });

    const deployment = getDeployment(env.XLAYER_CHAIN_ID);
    const provider = new ethers.JsonRpcProvider(deployment.rpc);
    const market = new ethers.Contract(
      deployment.contracts.XCupMarket.address,
      XCupMarketAbi as any,
      provider,
    ) as any;

    const enriched = await Promise.all(
      rows.map(async (r) => {
        const outcomes = JSON.parse(r.outcomesJson) as Array<{
          idx: number;
          label: string;
          teamId?: number;
          teamLogo?: string;
          playerName?: string;
          photo?: string;
        }>;
        const pots = await Promise.all(
          outcomes.map(async (o) => {
            try {
              return await (market.getOutcomePot(r.marketId, o.idx) as Promise<bigint>);
            } catch {
              return 0n;
            }
          }),
        );
        const total = pots.reduce((a, b) => a + b, 0n);
        const enrichedOutcomes = outcomes.map((o, i) => {
          const pot = pots[i] ?? 0n;
          return {
            ...o,
            potUsdc: Number(ethers.formatUnits(pot, 6)),
            impliedProb: total > 0n ? Number(pot) / Number(total) : 0,
            isWinner: r.settled && r.winningOutcome === o.idx,
          };
        });
        return {
          id: r.id,
          slug: r.slug,
          question: r.question,
          type: r.type,
          groupLetter: r.groupLetter,
          marketId: r.marketId,
          settled: r.settled,
          winningOutcome: r.winningOutcome,
          totalPotUsdc: Number(ethers.formatUnits(total, 6)),
          outcomes: enrichedOutcomes,
          createMarketTx: r.createMarketTx,
        };
      }),
    );

    return res.json({ ok: true, count: enriched.length, markets: enriched });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});
