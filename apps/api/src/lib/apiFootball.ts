import { env } from "../env.js";

/**
 * Typed API-Football (api-sports.io) client.
 *
 * Auth: `x-apisports-key` header.
 * Base URL: env.API_FOOTBALL_HOST (default v3.football.api-sports.io).
 * Free tier: 100 requests/day, seasons 2022-2024 only.
 *
 * Every method here returns the `response` array directly — the API's
 * outer envelope (get/parameters/errors/results/paging) is stripped.
 * If `errors` is non-empty we throw — quota errors and plan-restrictions
 * surface there, not as HTTP errors.
 */

const BASE = () => `https://${env.API_FOOTBALL_HOST}`;

interface ApiResponse<T> {
  get: string;
  parameters: Record<string, string> | string[];
  errors: Record<string, string> | string[];
  results: number;
  paging: { current: number; total: number };
  response: T;
}

/* -------------------------------------------------------------------------- */
/* Raw response types — only fields we use                                    */
/* -------------------------------------------------------------------------- */

export interface ApiTeam {
  id: number;
  name: string;
  logo: string;
  winner?: boolean | null; // present on fixtures.teams.{home,away}
}

export interface ApiVenue {
  id: number | null;
  name: string | null;
  city: string | null;
}

export interface ApiFixtureStatus {
  long: string;
  short: string; // NS, 1H, HT, 2H, ET, P, BT, FT, AET, PEN, PST, CANC, ABD
  elapsed: number | null;
  extra?: number | null;
}

export interface ApiFixtureEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string; logo: string };
  player: { id: number | null; name: string | null };
  assist?: { id: number | null; name: string | null };
  type: string; // "Goal" | "Card" | "subst" | "Var"
  detail: string; // "Normal Goal" | "Penalty" | "Yellow Card" | ...
  comments: string | null;
}

export interface ApiFixtureRaw {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    venue: ApiVenue;
    status: ApiFixtureStatus;
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string | null;
    season: number;
    round: string;
  };
  teams: {
    home: ApiTeam;
    away: ApiTeam;
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score?: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
  /** Only present on single-fixture GETs (/fixtures?id=X), not on the bulk list. */
  events?: ApiFixtureEvent[];
}

/* -------------------------------------------------------------------------- */
/* Tiny in-memory cache                                                       */
/* -------------------------------------------------------------------------- */

interface CacheEntry<T> {
  at: number;
  data: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

function fromCache<T>(key: string): T | null {
  const e = cache.get(key) as CacheEntry<T> | undefined;
  if (!e) return null;
  if (Date.now() - e.at > env.FIXTURE_CACHE_TTL * 1000) {
    cache.delete(key);
    return null;
  }
  return e.data;
}

function putCache<T>(key: string, data: T) {
  cache.set(key, { at: Date.now(), data });
}

/* -------------------------------------------------------------------------- */
/* Core request                                                                */
/* -------------------------------------------------------------------------- */

async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(BASE() + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const cacheKey = url.toString();
  const hit = fromCache<T>(cacheKey);
  if (hit) return hit;

  const res = await fetch(url, {
    headers: { "x-apisports-key": env.API_FOOTBALL_KEY! },
  });
  if (!res.ok) {
    throw new Error(`API-Football HTTP ${res.status} on ${path}`);
  }
  const json = (await res.json()) as ApiResponse<T>;

  if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length > 0) {
    const reasons = Object.entries(json.errors)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
    throw new Error(`API-Football error on ${path}: ${reasons}`);
  }

  putCache(cacheKey, json.response);
  return json.response;
}

/* -------------------------------------------------------------------------- */
/* Public methods                                                              */
/* -------------------------------------------------------------------------- */

/** Fetch every fixture for the configured WC league + season. */
export async function fetchWorldCupFixtures(): Promise<ApiFixtureRaw[]> {
  return get<ApiFixtureRaw[]>("/fixtures", {
    league: env.WC_LEAGUE_ID,
    season: env.WC_SEASON,
  });
}

/** Fetch a single fixture by id — includes events/lineups/statistics when applicable. */
export async function fetchFixture(id: number): Promise<ApiFixtureRaw | null> {
  const arr = await get<ApiFixtureRaw[]>("/fixtures", { id });
  return arr[0] ?? null;
}

/** Extract goal scorers from a fixture's events array. Returns [] if no events. */
export function extractScorers(f: ApiFixtureRaw): string[] {
  if (!f.events) return [];
  return f.events
    .filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty")
    .map((e) => e.player?.name ?? "")
    .filter(Boolean);
}

/** Live in-progress fixtures across the configured WC. */
export async function fetchLiveFixtures(): Promise<ApiFixtureRaw[]> {
  return get<ApiFixtureRaw[]>("/fixtures", {
    league: env.WC_LEAGUE_ID,
    season: env.WC_SEASON,
    live: "all",
  });
}

/* -------------------------------------------------------------------------- */
/* Standings + top scorers (cached the same way as fixtures)                  */
/* -------------------------------------------------------------------------- */

/**
 * Head-to-head history between two teams. Free-tier note: cannot pass `last=N`
 * (paid only). We fetch ALL meetings and slice in the caller. For nations the
 * total list is usually under 50 entries so this is fine.
 */
export async function fetchHeadToHead(team1Id: number, team2Id: number): Promise<ApiFixtureRaw[]> {
  // API normalizes the pair regardless of order, so sort to maximize cache hits.
  const [a, b] = team1Id < team2Id ? [team1Id, team2Id] : [team2Id, team1Id];
  return get<ApiFixtureRaw[]>("/fixtures/headtohead", { h2h: `${a}-${b}` });
}

export interface ApiStandingsTeam {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  group: string;
  form: string | null;
  status: string;
  description: string | null;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
}

export async function fetchStandings(): Promise<ApiStandingsTeam[][]> {
  const arr = await get<Array<{ league: { standings: ApiStandingsTeam[][] } }>>("/standings", {
    league: env.WC_LEAGUE_ID,
    season: env.WC_SEASON,
  });
  return arr[0]?.league.standings ?? [];
}

export interface ApiTopScorerRow {
  player: { id: number; name: string; photo: string; nationality: string };
  statistics: Array<{
    team: { id: number; name: string; logo: string };
    goals: { total: number; assists: number | null };
    games: { appearences: number; minutes: number };
  }>;
}

export async function fetchTopScorers(): Promise<ApiTopScorerRow[]> {
  return get<ApiTopScorerRow[]>("/players/topscorers", {
    league: env.WC_LEAGUE_ID,
    season: env.WC_SEASON,
  });
}

/**
 * Predictions endpoint — API-Football's algorithmic forecast for a fixture.
 * Free-tier compatible. Returns win probabilities, recommended advice, and
 * historical h2h baseline.
 *
 * Shape of the response object we care about:
 *   { winner: { name, comment }, percent: { home: "45%", draw: "45%", away: "10%" }, advice }
 */
export interface ApiPredictionRow {
  winner: { id?: number; name?: string; comment?: string };
  win_or_draw: boolean;
  under_over: string | null;
  goals: { home: string | null; away: string | null };
  advice: string;
  percent: { home: string; draw: string; away: string };
}

export async function fetchPredictions(fixtureId: number): Promise<ApiPredictionRow | null> {
  const arr = await get<Array<{ predictions: ApiPredictionRow }>>("/predictions", { fixture: fixtureId });
  if (!arr.length) return null;
  return arr[0]!.predictions;
}

/* ---- Lineups + player profile ---- */

export interface ApiLineupPlayer {
  player: { id: number; name: string; number: number; pos: string | null; grid: string | null };
}

export interface ApiLineupTeam {
  team: { id: number; name: string; logo: string; colors?: any };
  formation: string;
  startXI: ApiLineupPlayer[];
  substitutes: ApiLineupPlayer[];
  coach?: { id: number; name: string; photo: string };
}

export async function fetchLineups(fixtureId: number): Promise<ApiLineupTeam[]> {
  const arr = await get<ApiLineupTeam[]>("/fixtures/lineups", { fixture: fixtureId });
  return arr ?? [];
}

export interface ApiPlayerProfile {
  player: {
    id: number;
    name: string;
    firstname: string;
    lastname: string;
    age: number;
    birth: { date: string; place: string; country: string };
    nationality: string;
    height: string | null;
    weight: string | null;
    photo: string;
    injured: boolean;
  };
  statistics: Array<{
    team: { id: number; name: string; logo: string };
    league: { name: string; season: number };
    games: { appearences: number; lineups: number; minutes: number; position: string; rating: string | null };
    goals: { total: number | null; assists: number | null };
    cards: { yellow: number; red: number };
  }>;
}

export async function fetchPlayer(playerId: number, season: number): Promise<ApiPlayerProfile | null> {
  const arr = await get<ApiPlayerProfile[]>("/players", { id: playerId, season });
  if (!arr.length) return null;
  return arr[0]!;
}

/** Account/quota status — useful for the dashboard or debugging. */
export async function fetchAccountStatus(): Promise<{
  account: { firstname: string; lastname: string; email: string };
  subscription: { plan: string; end: string; active: boolean };
  requests: { current: number; limit_day: number };
}> {
  return get("/status", {});
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Map an API-Football fixture's final status into the on-chain market
 * outcome index. Conventions:
 *   - Group stage (3 outcomes): 0 = Home, 1 = Draw, 2 = Away
 *   - Knockout    (2 outcomes): 0 = Home advances, 1 = Away advances
 *
 * Returns null if the match isn't decided yet.
 */
export function fixtureToOutcomeIdx(f: ApiFixtureRaw, outcomeCount: number): number | null {
  const status = f.fixture.status.short;
  const isFinished = ["FT", "AET", "PEN"].includes(status);
  if (!isFinished) return null;

  const h = f.goals.home ?? 0;
  const a = f.goals.away ?? 0;

  if (outcomeCount === 3) {
    if (h > a) return 0;
    if (h < a) return 2;
    return 1; // draw
  }
  // Binary (knockout) — use penalty winner if applicable
  if (status === "PEN" && f.score?.penalty) {
    const ph = f.score.penalty.home ?? 0;
    const pa = f.score.penalty.away ?? 0;
    return ph > pa ? 0 : 1;
  }
  return h > a ? 0 : 1;
}

/** Is this fixture a knockout (binary outcome) or group stage (3 outcomes)? */
export function fixtureOutcomeCount(f: ApiFixtureRaw): 2 | 3 {
  const round = f.league.round.toLowerCase();
  if (round.includes("group")) return 3;
  return 2; // knockouts, finals — winner only (draws decided by penalties)
}
