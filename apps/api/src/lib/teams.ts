import { env } from "../env.js";

/**
 * Team registry for the configured World Cup season.
 *
 * Hits API-Football's /teams?league=X&season=Y once and caches the result
 * in memory for 24 hours. The team list is injected into the Groq parser's
 * system prompt so the LLM emits canonical names ("France", "England") even
 * when the user writes aliases ("Les Bleus", "Three Lions", "Selecao").
 *
 * Without this, the strategy resolver's contains-fuzzy compare misses on
 * those aliases and the strategy resolves to zero markets.
 */

export interface TeamRecord {
  id: number;
  name: string;
  code: string | null;
  country: string | null;
  logo: string;
}

interface TeamCache {
  teams: TeamRecord[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 24 * 3600 * 1000;
let cache: TeamCache | null = null;

interface ApiTeamsResponse {
  errors: Record<string, string> | string[];
  response: Array<{
    team: { id: number; name: string; code: string | null; country: string; logo: string };
  }>;
}

/**
 * Fetch the team list from API-Football. Hits cache when fresh.
 * Costs 1 of the 100/day request budget per refresh.
 */
export async function fetchWCTeams(force = false): Promise<TeamRecord[]> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.teams;
  }
  const url = `https://${env.API_FOOTBALL_HOST}/teams?league=${env.WC_LEAGUE_ID}&season=${env.WC_SEASON}`;
  const res = await fetch(url, { headers: { "x-apisports-key": env.API_FOOTBALL_KEY! } });
  if (!res.ok) throw new Error(`/teams HTTP ${res.status}`);
  const json = (await res.json()) as ApiTeamsResponse;
  if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length > 0) {
    throw new Error(`/teams error: ${JSON.stringify(json.errors)}`);
  }
  const teams: TeamRecord[] = json.response.map((r) => ({
    id: r.team.id,
    name: r.team.name,
    code: r.team.code,
    country: r.team.country,
    logo: r.team.logo,
  }));
  cache = { teams, fetchedAt: Date.now() };
  return teams;
}

/** Synchronous getter — returns the cached list (or [] if not loaded yet). */
export function getCachedTeams(): TeamRecord[] {
  return cache?.teams ?? [];
}

/**
 * Format the team list for injection into the Groq system prompt.
 * Trade-off: more detail = better disambiguation but more tokens.
 * Format: "Argentina (ARG), Brazil (BRA), ..." — about 250 tokens for 32 teams.
 */
export function formatTeamsForPrompt(teams: TeamRecord[]): string {
  if (teams.length === 0) return "";
  return teams.map((t) => (t.code ? `${t.name} (${t.code})` : t.name)).sort().join(", ");
}

/**
 * Fire-and-forget warmup. Called at API boot so the first parse request
 * doesn't pay the round-trip cost. Failures are logged, not thrown — the
 * parser will fall back to its un-augmented prompt if teams aren't loaded.
 */
export async function warmupTeamCache(): Promise<void> {
  try {
    const teams = await fetchWCTeams();
    console.log(`✓ team cache warmed: ${teams.length} WC ${env.WC_SEASON} teams loaded`);
  } catch (err) {
    console.warn("⚠️  team cache warmup failed (parser will work without team-name awareness):", err);
  }
}
