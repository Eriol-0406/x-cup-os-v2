import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { fetchHeadToHead } from "../lib/apiFootball.js";

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
