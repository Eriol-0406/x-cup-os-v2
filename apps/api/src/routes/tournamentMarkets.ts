import { Router } from "express";
import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";

export const tournamentMarketsRouter = Router();

/**
 * GET /tournament-markets — list every tournament-winner market for the
 * configured season, enriched with on-chain pot data so the frontend can
 * render implied odds.
 *
 * Response includes:
 *   teamId, teamName, teamLogo, marketId, settled, winningOutcome
 *   yesPotUsdc, noPotUsdc, totalPotUsdc, impliedYesProb (0-1)
 */
tournamentMarketsRouter.get("/", async (_req, res) => {
  try {
    const rows = await prisma.tournamentMarket.findMany({
      where: { season: env.WC_SEASON },
      orderBy: { teamName: "asc" },
    });
    if (rows.length === 0) return res.json({ ok: true, markets: [] });

    const deployment = getDeployment(env.XLAYER_CHAIN_ID);
    const provider = new ethers.JsonRpcProvider(deployment.rpc);
    const market = new ethers.Contract(
      deployment.contracts.XCupMarket.address,
      XCupMarketAbi as any,
      provider,
    ) as any;

    // Fetch pots for every market in parallel.
    const markets = await Promise.all(
      rows.map(async (r) => {
        try {
          const [yesPot, noPot, onchain] = await Promise.all([
            market.getOutcomePot(r.marketId, 0) as Promise<bigint>,
            market.getOutcomePot(r.marketId, 1) as Promise<bigint>,
            market.getMarket(r.marketId),
          ]);
          const total = yesPot + noPot;
          const impliedYesProb = total > 0n ? Number(yesPot) / Number(total) : 0;
          return {
            teamId: r.teamId,
            teamName: r.teamName,
            teamLogo: r.teamLogo,
            teamCode: r.teamCode,
            marketId: r.marketId,
            settled: r.settled,
            winningOutcome: r.winningOutcome,
            yesPotUsdc: Number(ethers.formatUnits(yesPot, 6)),
            noPotUsdc: Number(ethers.formatUnits(noPot, 6)),
            totalPotUsdc: Number(ethers.formatUnits(total, 6)),
            impliedYesProb,
            closeTime: Number(onchain.closeTime),
            createMarketTx: r.createMarketTx,
          };
        } catch (err: any) {
          return {
            teamId: r.teamId,
            teamName: r.teamName,
            teamLogo: r.teamLogo,
            teamCode: r.teamCode,
            marketId: r.marketId,
            settled: r.settled,
            winningOutcome: r.winningOutcome,
            yesPotUsdc: 0,
            noPotUsdc: 0,
            totalPotUsdc: 0,
            impliedYesProb: 0,
            closeTime: 0,
            createMarketTx: r.createMarketTx,
            error: err?.message ?? "read failed",
          };
        }
      }),
    );

    return res.json({ ok: true, season: env.WC_SEASON, markets });
  } catch (err: any) {
    console.error("[GET /tournament-markets]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});
