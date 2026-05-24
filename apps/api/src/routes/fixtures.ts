import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const fixturesRouter = Router();

const ListQuery = z.object({
  status: z.enum(["all", "live", "upcoming", "finished"]).default("all"),
  round: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).default(64),
});

/**
 * GET /fixtures — filterable list of synced fixtures.
 *
 *   ?status=live      → in-progress matches only
 *   ?status=upcoming  → not yet started, future date
 *   ?status=finished  → FT / AET / PEN
 *   ?status=all       → no filter
 *   ?round=Round+of+16 → exact round match
 */
fixturesRouter.get("/", async (req, res) => {
  const q = ListQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ ok: false, error: "invalid query", issues: q.error.flatten() });

  const where: any = {};
  switch (q.data.status) {
    case "live":
      where.status = { in: ["1H", "HT", "2H", "ET", "P", "BT"] };
      break;
    case "upcoming":
      where.status = { in: ["NS", "TBD"] };
      break;
    case "finished":
      where.status = { in: ["FT", "AET", "PEN"] };
      break;
  }
  if (q.data.round) where.round = q.data.round;

  const fixtures = await prisma.fixture.findMany({
    where,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: q.data.take,
    include: { market: true },
  });

  return res.json({
    ok: true,
    count: fixtures.length,
    fixtures: fixtures.map(serializeFixture),
  });
});

/** GET /fixtures/:id — single fixture by id. */
fixturesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  const fixture = await prisma.fixture.findUnique({
    where: { id },
    include: { market: true },
  });
  if (!fixture) return res.status(404).json({ ok: false, error: "fixture not found" });
  return res.json({ ok: true, fixture: serializeFixture(fixture) });
});

/** Get the distinct rounds available — useful for filter UI. */
fixturesRouter.get("/_meta/rounds", async (_req, res) => {
  const rows = await prisma.fixture.findMany({
    distinct: ["round"],
    select: { round: true },
    orderBy: { round: "asc" },
  });
  return res.json({ ok: true, rounds: rows.map((r) => r.round) });
});

function serializeFixture(f: any) {
  return {
    id: f.id,
    date: f.date.toISOString(),
    status: f.status,
    round: f.round,
    home: { id: f.homeTeamId, name: f.homeTeamName, logo: f.homeTeamLogo, goals: f.homeGoals },
    away: { id: f.awayTeamId, name: f.awayTeamName, logo: f.awayTeamLogo, goals: f.awayGoals },
    penalty: f.penaltyHome !== null ? { home: f.penaltyHome, away: f.penaltyAway } : null,
    venue: f.venueName ? { name: f.venueName, city: f.venueCity } : null,
    market: f.market
      ? {
          marketId: f.market.marketId,
          outcomeCount: f.market.outcomeCount,
          createTx: f.market.createMarketTx,
        }
      : null,
  };
}
