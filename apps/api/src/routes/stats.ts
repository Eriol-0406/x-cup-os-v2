import { Router } from "express";
import { fetchStandings, fetchTopScorers } from "../lib/apiFootball.js";
import { env } from "../env.js";

export const statsRouter = Router();

/**
 * GET /stats/standings — group tables for the configured WC season.
 * Cached upstream by the apiFootball client (FIXTURE_CACHE_TTL).
 */
statsRouter.get("/standings", async (_req, res) => {
  try {
    const groups = await fetchStandings();
    return res.json({ ok: true, season: env.WC_SEASON, groups });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/**
 * GET /stats/top-scorers — Golden Boot race for the configured WC season.
 * Cached upstream.
 */
statsRouter.get("/top-scorers", async (_req, res) => {
  try {
    const players = await fetchTopScorers();
    const trimmed = players.slice(0, 20).map((p) => ({
      id: p.player.id,
      name: p.player.name,
      photo: p.player.photo,
      nationality: p.player.nationality,
      team: p.statistics[0]?.team ?? null,
      goals: p.statistics[0]?.goals?.total ?? 0,
      assists: p.statistics[0]?.goals?.assists ?? 0,
      appearances: p.statistics[0]?.games?.appearences ?? 0,
      minutes: p.statistics[0]?.games?.minutes ?? 0,
    }));
    return res.json({ ok: true, season: env.WC_SEASON, players: trimmed });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err?.message ?? String(err) });
  }
});
