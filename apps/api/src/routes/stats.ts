import { Router } from "express";
import { fetchStandings, fetchTopScorers } from "../lib/apiFootball.js";
import { env } from "../env.js";

export const statsRouter = Router();

/**
 * Pre-tournament Golden Boot favorites — surfaced when API-Football returns
 * no real goal data yet (every WC fixture is still NS). These are the players
 * sportsbooks list as top-scorer favorites at the start of the tournament,
 * so users have something to browse + bet on from day one. Once real matches
 * start scoring goals, the live API response takes precedence.
 */
const PRE_TOURNAMENT_TOP_SCORERS: Record<
  number,
  Array<{
    id: number;
    name: string;
    photo: string;
    nationality: string;
    teamName: string;
    teamLogo: string;
    odds: string;
  }>
> = {
  2022: [
    { id: 154,  name: "Lionel Messi",        photo: "https://media.api-sports.io/football/players/154.png",  nationality: "Argentina", teamName: "Argentina",     teamLogo: "https://media.api-sports.io/football/teams/26.png",  odds: "+700"  },
    { id: 278,  name: "Kylian Mbappé",       photo: "https://media.api-sports.io/football/players/278.png",  nationality: "France",    teamName: "France",        teamLogo: "https://media.api-sports.io/football/teams/2.png",   odds: "+650"  },
    { id: 276,  name: "Neymar",              photo: "https://media.api-sports.io/football/players/276.png",  nationality: "Brazil",    teamName: "Brazil",        teamLogo: "https://media.api-sports.io/football/teams/6.png",   odds: "+900"  },
    { id: 184,  name: "Harry Kane",          photo: "https://media.api-sports.io/football/players/184.png",  nationality: "England",   teamName: "England",       teamLogo: "https://media.api-sports.io/football/teams/10.png",  odds: "+800"  },
    { id: 521,  name: "Karim Benzema",       photo: "https://media.api-sports.io/football/players/521.png",  nationality: "France",    teamName: "France",        teamLogo: "https://media.api-sports.io/football/teams/2.png",   odds: "+1200" },
    { id: 874,  name: "Cristiano Ronaldo",   photo: "https://media.api-sports.io/football/players/874.png",  nationality: "Portugal",  teamName: "Portugal",      teamLogo: "https://media.api-sports.io/football/teams/27.png",  odds: "+1400" },
  ],
  2026: [
    { id: 278,   name: "Kylian Mbappé",      photo: "https://media.api-sports.io/football/players/278.png",   nationality: "France",    teamName: "France",      teamLogo: "https://media.api-sports.io/football/teams/2.png",    odds: "+550"  },
    { id: 1100,  name: "Erling Haaland",     photo: "https://media.api-sports.io/football/players/1100.png",  nationality: "Norway",    teamName: "Norway",      teamLogo: "https://media.api-sports.io/football/teams/1090.png", odds: "+700"  },
    { id: 2932,  name: "Vinícius Júnior",    photo: "https://media.api-sports.io/football/players/2932.png",  nationality: "Brazil",    teamName: "Brazil",      teamLogo: "https://media.api-sports.io/football/teams/6.png",    odds: "+900"  },
    { id: 19220, name: "Jude Bellingham",    photo: "https://media.api-sports.io/football/players/19220.png", nationality: "England",   teamName: "England",     teamLogo: "https://media.api-sports.io/football/teams/10.png",   odds: "+1100" },
    { id: 342,   name: "Lautaro Martínez",   photo: "https://media.api-sports.io/football/players/342.png",   nationality: "Argentina", teamName: "Argentina",   teamLogo: "https://media.api-sports.io/football/teams/26.png",   odds: "+1200" },
    { id: 184,   name: "Harry Kane",         photo: "https://media.api-sports.io/football/players/184.png",   nationality: "England",   teamName: "England",     teamLogo: "https://media.api-sports.io/football/teams/10.png",   odds: "+1300" },
    { id: 47380, name: "Lamine Yamal",       photo: "https://media.api-sports.io/football/players/47380.png", nationality: "Spain",     teamName: "Spain",       teamLogo: "https://media.api-sports.io/football/teams/9.png",    odds: "+1500" },
    { id: 154,   name: "Lionel Messi",       photo: "https://media.api-sports.io/football/players/154.png",   nationality: "Argentina", teamName: "Argentina",   teamLogo: "https://media.api-sports.io/football/teams/26.png",   odds: "+1800" },
    { id: 1485,  name: "Phil Foden",         photo: "https://media.api-sports.io/football/players/1485.png",  nationality: "England",   teamName: "England",     teamLogo: "https://media.api-sports.io/football/teams/10.png",   odds: "+2000" },
    { id: 2295,  name: "Julián Álvarez",     photo: "https://media.api-sports.io/football/players/2295.png",  nationality: "Argentina", teamName: "Argentina",   teamLogo: "https://media.api-sports.io/football/teams/26.png",   odds: "+2200" },
  ],
};

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
    // Real data path — at least one player has a goal recorded
    if (players.length > 0 && (players[0]?.statistics[0]?.goals?.total ?? 0) > 0) {
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
        preTournament: false,
      }));
      return res.json({ ok: true, season: env.WC_SEASON, players: trimmed });
    }
    // Pre-tournament fallback — return sportsbook-favorite forwards with their
    // odds so users have a list to browse + bet on before any goal is scored.
    const favorites = PRE_TOURNAMENT_TOP_SCORERS[env.WC_SEASON] ?? [];
    const fallback = favorites.map((f, i) => ({
      id: f.id,
      name: f.name,
      photo: f.photo,
      nationality: f.nationality,
      team: { id: 0, name: f.teamName, logo: f.teamLogo },
      goals: 0,
      assists: 0,
      appearances: 0,
      minutes: 0,
      // Bookmaker-style odds for the top-scorer outright (American format).
      // Surfaced so the page has a meaningful rank order pre-tournament.
      preMarketOdds: f.odds,
      preTournament: true,
      rank: i + 1,
    }));
    return res.json({
      ok: true,
      season: env.WC_SEASON,
      players: fallback,
      note: "Pre-tournament odds — real goal counts replace this once matches start",
    });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err?.message ?? String(err) });
  }
});
