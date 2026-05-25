import { Router } from "express";
import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";

export const playerPropsRouter = Router();

/**
 * GET /player-prop-markets/by-fixture/:fixtureId
 * Returns every PlayerPropMarket attached to the fixture, enriched with
 * on-chain pot data per outcome so the UI can render odds.
 */
playerPropsRouter.get("/by-fixture/:fixtureId", async (req, res) => {
  const fixtureId = Number(req.params.fixtureId);
  if (!Number.isFinite(fixtureId)) return res.status(400).json({ ok: false, error: "invalid fixtureId" });

  const props = await prisma.playerPropMarket.findMany({ where: { fixtureId } });
  if (props.length === 0) return res.json({ ok: true, markets: [] });

  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const xcup = new ethers.Contract(deployment.contracts.XCupMarket.address, XCupMarketAbi as any, provider) as any;

  const enriched = await Promise.all(
    props.map(async (p) => {
      const outcomes = JSON.parse(p.outcomesJson) as Array<{ idx: number; label: string; playerName?: string; teamName?: string }>;
      const pots = await Promise.all(
        outcomes.map((o) => xcup.getOutcomePot(p.marketId, o.idx).then((n: bigint) => Number(ethers.formatUnits(n, 6)))),
      );
      const totalPot = pots.reduce((s, v) => s + v, 0);
      return {
        id: p.id,
        fixtureId: p.fixtureId,
        type: p.type,
        marketId: p.marketId,
        settled: p.settled,
        winningOutcome: p.winningOutcome,
        totalPotUsdc: totalPot,
        outcomes: outcomes.map((o, i) => ({
          ...o,
          potUsdc: pots[i] ?? 0,
          impliedProb: totalPot > 0 ? (pots[i] ?? 0) / totalPot : 0,
          isWinner: p.settled && p.winningOutcome === o.idx,
        })),
      };
    }),
  );

  return res.json({ ok: true, markets: enriched });
});

/**
 * GET /player-prop-markets — list all player-prop markets across fixtures
 * (lightweight, no pot enrichment) for activity dashboards / leaderboards.
 */
playerPropsRouter.get("/", async (_req, res) => {
  const props = await prisma.playerPropMarket.findMany({
    orderBy: { createdAt: "desc" },
    include: { fixture: { select: { homeTeamName: true, awayTeamName: true, round: true } } },
  });
  return res.json({
    ok: true,
    count: props.length,
    markets: props.map((p) => ({
      id: p.id,
      fixtureId: p.fixtureId,
      type: p.type,
      marketId: p.marketId,
      settled: p.settled,
      home: p.fixture.homeTeamName,
      away: p.fixture.awayTeamName,
      round: p.fixture.round,
      outcomeCount: p.outcomeCount,
    })),
  });
});
