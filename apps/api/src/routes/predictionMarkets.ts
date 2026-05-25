import { Router } from "express";
import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";

export const predictionMarketsRouter = Router();

/** GET /prediction-markets — list every prediction market, enriched with on-chain pots. */
predictionMarketsRouter.get("/", async (_req, res) => {
  const rows = await prisma.predictionMarket.findMany({
    where: { season: env.WC_SEASON },
    orderBy: { createdAt: "asc" },
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
      let yesPot = 0n;
      let noPot = 0n;
      try {
        [yesPot, noPot] = await Promise.all([
          market.getOutcomePot(r.marketId, 0) as Promise<bigint>,
          market.getOutcomePot(r.marketId, 1) as Promise<bigint>,
        ]);
      } catch {
        // chain read failed — leave zeros
      }
      const total = yesPot + noPot;
      const yesProb = total > 0n ? Number(yesPot) / Number(total) : 0;
      let allowlist: string[] = [];
      try { allowlist = JSON.parse(r.allowlistJson); } catch { /* empty */ }
      return {
        id: r.id,
        slug: r.slug,
        question: r.question,
        category: r.category,
        marketId: r.marketId,
        settled: r.settled,
        winningOutcome: r.winningOutcome,
        isPrivate: r.isPrivate,
        allowlist,
        yesPotUsdc: Number(ethers.formatUnits(yesPot, 6)),
        noPotUsdc: Number(ethers.formatUnits(noPot, 6)),
        totalPotUsdc: Number(ethers.formatUnits(total, 6)),
        yesProb,
        createMarketTx: r.createMarketTx,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  );

  return res.json({ ok: true, count: enriched.length, markets: enriched });
});

/** GET /prediction-markets/:slug — single market by slug. */
predictionMarketsRouter.get("/:slug", async (req, res) => {
  const slug = String(req.params.slug ?? "");
  const row = await prisma.predictionMarket.findUnique({ where: { slug } });
  if (!row) return res.status(404).json({ ok: false, error: "prediction market not found" });
  return res.json({ ok: true, market: row });
});
