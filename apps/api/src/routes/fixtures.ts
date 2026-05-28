import { Router } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { fetchHeadToHead, fetchPredictions, fetchLineups } from "../lib/apiFootball.js";

export const fixturesRouter = Router();

/**
 * GET /fixtures/h2h?a=ID1&b=ID2 — historical meetings between two teams.
 * Pulls from API-Football (cached). Free tier returns ALL meetings (no `last`
 * param allowed) so we cap to the most recent 10 in the response.
 */
fixturesRouter.get("/h2h", async (req, res) => {
  const a = Number(req.query.a);
  const b = Number(req.query.b);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return res.status(400).json({ ok: false, error: "a and b must be positive team ids" });
  }
  try {
    const matches = await fetchHeadToHead(a, b);
    // Sort newest first, slice to last 10
    const sorted = [...matches].sort(
      (x, y) => new Date(y.fixture.date).getTime() - new Date(x.fixture.date).getTime(),
    );
    const slim = sorted.slice(0, 10).map((m) => ({
      id: m.fixture.id,
      date: m.fixture.date,
      status: m.fixture.status.short,
      league: m.league.name,
      season: m.league.season,
      round: m.league.round,
      venue: m.fixture.venue?.city ?? null,
      home: { id: m.teams.home.id, name: m.teams.home.name, logo: m.teams.home.logo, goals: m.goals.home },
      away: { id: m.teams.away.id, name: m.teams.away.name, logo: m.teams.away.logo, goals: m.goals.away },
      penalty: m.score?.penalty?.home != null ? { home: m.score.penalty.home, away: m.score.penalty.away } : null,
    }));
    // Summary: wins per side + draws. Penalty winners in knockout matches
    // count as wins (otherwise a 3-3 final with one side advancing on pens
    // would show as a draw, which is misleading).
    let aWins = 0, bWins = 0, draws = 0;
    for (const m of matches) {
      const hg = m.goals.home, ag = m.goals.away;
      if (hg == null || ag == null) continue;
      const homeIsA = m.teams.home.id === a;
      let homeWon: boolean | null = null;
      if (hg > ag) homeWon = true;
      else if (hg < ag) homeWon = false;
      else if (m.score?.penalty?.home != null && m.score?.penalty?.away != null) {
        homeWon = m.score.penalty.home > m.score.penalty.away;
      }
      if (homeWon === null) {
        draws++;
      } else if ((homeIsA && homeWon) || (!homeIsA && !homeWon)) {
        aWins++;
      } else {
        bWins++;
      }
    }
    return res.json({
      ok: true,
      summary: { total: matches.length, aWins, bWins, draws },
      matches: slim,
    });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err?.message ?? "h2h fetch failed" });
  }
});

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

  // Default scope: the currently-configured WC season. Older seasons remain
  // in the DB (Fixture rows persist across env flips) but are filtered out
  // here so the UI shows one tournament at a time.
  const where: any = { season: env.WC_SEASON };
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

/**
 * GET /fixtures/:id/odds-comparison — model vs pool implied odds for a fixture.
 *
 * Returns the API-Football algorithmic prediction (home/draw/away %)
 * alongside the implied probabilities derived from our on-chain pool's
 * outcomePots. The delta column shows where the crowd's money disagrees
 * with the model — a sharp bettor's edge signal.
 */
fixturesRouter.get("/:id/odds-comparison", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });

  const fixture = await prisma.fixture.findUnique({ where: { id }, include: { market: true } });
  if (!fixture) return res.status(404).json({ ok: false, error: "fixture not found" });
  if (!fixture.market) return res.status(404).json({ ok: false, error: "no on-chain market for this fixture" });

  // 1. Model prediction (API-Football). Cached aggressively.
  let model: { home: number; draw: number; away: number; winner: string | null; advice: string } | null = null;
  try {
    const pred = await fetchPredictions(id);
    if (pred) {
      const pct = (s: string) => parseInt(String(s).replace("%", ""), 10) / 100 || 0;
      model = {
        home: pct(pred.percent.home),
        draw: pct(pred.percent.draw),
        away: pct(pred.percent.away),
        winner: pred.winner?.name ?? null,
        advice: pred.advice ?? "",
      };
    }
  } catch (err: any) {
    // Predictions can be unavailable for some fixtures — degrade gracefully
    console.warn(`[odds-comparison] no predictions for ${id}:`, err?.message ?? err);
  }

  // 2. Pool implied probabilities — read outcomePots from chain
  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const market = new ethers.Contract(deployment.contracts.XCupMarket.address, XCupMarketAbi as any, provider) as any;
  const oc = fixture.market.outcomeCount;
  const pots: bigint[] = await Promise.all(
    Array.from({ length: oc }, (_, i) => market.getOutcomePot(fixture.market!.marketId, i)),
  );
  const total = pots.reduce((a, b) => a + b, 0n);
  const pool =
    total > 0n
      ? {
          home: Number(pots[0]!) / Number(total),
          draw: oc === 3 ? Number(pots[1]!) / Number(total) : 0,
          away: oc === 3 ? Number(pots[2]!) / Number(total) : Number(pots[1]!) / Number(total),
          totalPotUsdc: Number(ethers.formatUnits(total, 6)),
        }
      : { home: 0, draw: 0, away: 0, totalPotUsdc: 0 };

  // 3. Delta (only meaningful when both sides have data)
  const delta = model
    ? {
        home: pool.home - model.home,
        draw: pool.draw - model.draw,
        away: pool.away - model.away,
      }
    : null;

  return res.json({
    ok: true,
    fixture: {
      id: fixture.id,
      home: fixture.homeTeamName,
      away: fixture.awayTeamName,
      outcomeCount: oc,
      marketId: fixture.market.marketId,
    },
    model,
    pool,
    delta,
  });
});

/**
 * GET /fixtures/:id/lineups — starting XI + formation for both teams.
 *
 * Free-tier compatible. Cached aggressively (lineups don't change after match).
 */
fixturesRouter.get("/:id/lineups", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const teams = await fetchLineups(id);
    return res.json({
      ok: true,
      fixtureId: id,
      teams: teams.map((t) => ({
        team: t.team,
        formation: t.formation,
        startXI: t.startXI.map((p) => p.player),
        substitutes: t.substitutes.map((p) => p.player),
        coach: t.coach ?? null,
      })),
    });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err?.message ?? "lineups fetch failed" });
  }
});

/** Get the distinct rounds available — useful for filter UI. */
fixturesRouter.get("/_meta/rounds", async (_req, res) => {
  const rows = await prisma.fixture.findMany({
    where: { season: env.WC_SEASON },
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
