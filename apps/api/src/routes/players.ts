import { Router } from "express";
import { fetchPlayer } from "../lib/apiFootball.js";
import { env } from "../env.js";

export const playersRouter = Router();

/** GET /players/:id — player profile + season statistics. */
playersRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "invalid player id" });
  }
  try {
    const profile = await fetchPlayer(id, env.WC_SEASON);
    if (!profile) return res.status(404).json({ ok: false, error: "player not found for this season" });

    // Find the "primary" stats block — preferred match: WC season for the national team.
    const nationalBlock =
      profile.statistics.find((s) => s.league.name.toLowerCase().includes("world cup")) ??
      profile.statistics[0];

    return res.json({
      ok: true,
      player: {
        id: profile.player.id,
        name: profile.player.name,
        firstname: profile.player.firstname,
        lastname: profile.player.lastname,
        age: profile.player.age,
        nationality: profile.player.nationality,
        birth: profile.player.birth,
        height: profile.player.height,
        weight: profile.player.weight,
        photo: profile.player.photo,
        injured: profile.player.injured,
      },
      stats: nationalBlock
        ? {
            team: nationalBlock.team,
            league: nationalBlock.league,
            appearances: nationalBlock.games.appearences ?? 0,
            lineups: nationalBlock.games.lineups ?? 0,
            minutes: nationalBlock.games.minutes ?? 0,
            position: nationalBlock.games.position ?? "—",
            rating: nationalBlock.games.rating ?? null,
            goals: nationalBlock.goals.total ?? 0,
            assists: nationalBlock.goals.assists ?? 0,
            yellow: nationalBlock.cards.yellow ?? 0,
            red: nationalBlock.cards.red ?? 0,
          }
        : null,
      allStats: profile.statistics,
    });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err?.message ?? "player fetch failed" });
  }
});
