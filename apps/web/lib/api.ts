export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/**
 * Shape returned by POST /strategies/parse. Mirrors apps/api/src/parser.ts but
 * kept loose here — when we wire `@x-cup/types` into the web bundle later we
 * can swap to the precise ParsedStrategy type.
 */
export type ParseSuccess = {
  ok: true;
  parsed: {
    trigger: {
      combinator: "AND" | "OR";
      conditions: Array<
        | { kind: "match_winner"; team: string; match?: "next" | "specific"; matchId?: string }
        | { kind: "player_scores"; player: string; match?: "next" | "specific"; matchId?: string }
        | {
            kind: "score_threshold";
            team: string;
            operator: ">=" | ">" | "==" | "<" | "<=";
            goals: number;
            match?: "next" | "specific";
            matchId?: string;
          }
      >;
    };
    action: {
      marketRef: string;
      outcome: "YES" | "NO";
      stakeUsdc: number;
    };
    riskLimits: {
      maxLossUsdc?: number;
      maxFires?: number;
      expiresAt?: string;
    };
    notes?: string;
  };
  latencyMs: number;
  model: string;
};

export type ParseFailure = {
  ok: false;
  error: string;
  rawToolArgs?: unknown;
  issues?: unknown;
  latencyMs?: number;
};

export interface AgentInfo {
  mainWallet: string;
  agentAddress: string;
  freshlyCreated: boolean;
}

export async function getOrCreateAgent(walletAddress: string): Promise<AgentInfo> {
  const res = await fetch(`${API_URL}/users/by-address/${walletAddress}`);
  const json = (await res.json()) as { ok: boolean } & AgentInfo & { error?: string };
  if (!json.ok) throw new Error(json.error ?? "Failed to provision agent");
  return { mainWallet: json.mainWallet, agentAddress: json.agentAddress, freshlyCreated: json.freshlyCreated };
}

export async function parseStrategy(text: string, signal?: AbortSignal): Promise<ParseSuccess | ParseFailure> {
  const res = await fetch(`${API_URL}/strategies/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  return (await res.json()) as ParseSuccess | ParseFailure;
}

/* ---- Strategy CRUD ---- */

export interface StrategyRecord {
  id: string;
  englishText: string;
  parsed: ParseSuccess["parsed"];
  status: "draft" | "active" | "paused" | "expired" | "exhausted";
  fireCount: number;
  maxLossUsdc: number | null;
  currentPnlUsdc: number;
  createdAt: string;
}

export async function deployStrategy(
  walletAddress: string,
  text: string,
  parsed: ParseSuccess["parsed"],
): Promise<StrategyRecord> {
  const res = await fetch(`${API_URL}/strategies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, text, parsed }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to deploy strategy");
  const activateRes = await fetch(`${API_URL}/strategies/${json.strategy.id}/activate`, { method: "POST" });
  const activateJson = await activateRes.json();
  if (!activateJson.ok) throw new Error(activateJson.error ?? "Failed to activate strategy");
  return activateJson.strategy as StrategyRecord;
}

export async function listStrategies(walletAddress: string): Promise<StrategyRecord[]> {
  const res = await fetch(`${API_URL}/strategies?wallet=${walletAddress}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to list strategies");
  return json.strategies as StrategyRecord[];
}

/* ---- Strategy fires (agent activity) ---- */

export interface FireRecord {
  id: string;
  strategyId: string;
  marketId: number;
  outcomeIdx: number;
  stakeUsdc: number;
  txHash: string | null;
  status: "pending" | "confirmed" | "failed";
  failureReason: string | null;
  matchEvent: {
    marketId: number;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    scorers: string[];
  };
  createdAt: string;
}

export async function listFiresByWallet(walletAddress: string): Promise<FireRecord[]> {
  const res = await fetch(`${API_URL}/strategies/fires/by-wallet?wallet=${walletAddress}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to list fires");
  return json.fires as FireRecord[];
}

/* ---- Fixtures (API-Football mirror) ---- */

export type FixtureStatus = "NS" | "1H" | "HT" | "2H" | "ET" | "P" | "BT" | "FT" | "AET" | "PEN" | "PST" | "TBD" | "CANC" | "ABD";

export interface FixtureRecord {
  id: number;
  date: string;
  status: FixtureStatus;
  round: string;
  home: { id: number; name: string; logo: string; goals: number | null };
  away: { id: number; name: string; logo: string; goals: number | null };
  penalty: { home: number; away: number } | null;
  venue: { name: string; city: string } | null;
  market: {
    marketId: number;
    outcomeCount: number;
    createTx: string;
  } | null;
}

export type FixtureStatusFilter = "all" | "live" | "upcoming" | "finished";

export async function listFixtures(filter: FixtureStatusFilter = "all"): Promise<FixtureRecord[]> {
  const res = await fetch(`${API_URL}/fixtures?status=${filter}&take=200`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to list fixtures");
  return json.fixtures as FixtureRecord[];
}

export function isLiveStatus(s: FixtureStatus): boolean {
  return ["1H", "HT", "2H", "ET", "P", "BT"].includes(s);
}

export function isFinishedStatus(s: FixtureStatus): boolean {
  return ["FT", "AET", "PEN"].includes(s);
}

/** Replay a finished fixture — admin endpoint that fires strategies + settles. */
export interface ReplayResponse {
  ok: boolean;
  error?: string;
  fixture?: { id: number; status: string; home: string; away: string; score: string };
  matchEvent?: { marketId: number; winningOutcomeIdx: number; scorers: string[] };
  fires?: Array<{ fireId: string; ok: boolean; txHash?: string; reason?: string }>;
  settle?: {
    ok: boolean;
    settleTx?: string;
    claims: Array<{ strategyId: string; ok: boolean; txHash?: string; payoutUsdc?: string; reason?: string }>;
  };
}

export async function replayFixture(fixtureId: number): Promise<ReplayResponse> {
  const res = await fetch(`${API_URL}/admin/replay-fixture/${fixtureId}`, { method: "POST" });
  return (await res.json()) as ReplayResponse;
}

/* ---- Pillar 1: tournament-winner markets ---- */

export interface TournamentMarketRecord {
  teamId: number;
  teamName: string;
  teamLogo: string;
  teamCode: string | null;
  marketId: number;
  settled: boolean;
  winningOutcome: number | null;
  yesPotUsdc: number;
  noPotUsdc: number;
  totalPotUsdc: number;
  impliedYesProb: number;
  closeTime: number;
  createMarketTx: string;
  error?: string;
}

export async function listTournamentMarkets(): Promise<TournamentMarketRecord[]> {
  const res = await fetch(`${API_URL}/tournament-markets`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to list tournament markets");
  return json.markets as TournamentMarketRecord[];
}

/* ---- Leaderboard + copy strategy ---- */

export interface LeaderboardEntry {
  rank: number;
  strategyId: string;
  ownerShort: string;
  ownerFull: string;
  englishText: string;
  status: "active" | "exhausted" | "paused" | "expired";
  fireCount: number;
  claimCount: number;
  currentPnlUsdc: number;
  maxLossUsdc: number | null;
  createdAt: string;
}

export async function listLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_URL}/strategies/leaderboard?limit=${limit}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to load leaderboard");
  return json.leaderboard as LeaderboardEntry[];
}

/* ---- Player-prop markets (first scorer, etc.) ---- */

export interface PropOutcomeView {
  idx: number;
  label: string;
  playerName?: string;
  teamName?: string;
  potUsdc: number;
  impliedProb: number;
  isWinner: boolean;
}

export interface PlayerPropMarketView {
  id: string;
  fixtureId: number;
  type: string;
  marketId: number;
  settled: boolean;
  winningOutcome: number | null;
  totalPotUsdc: number;
  outcomes: PropOutcomeView[];
}

/* ---- Prediction markets (Y/N opinion) ---- */

export interface PredictionMarketView {
  id: string;
  slug: string;
  question: string;
  category: "Tournament" | "Player" | "Special";
  marketId: number;
  settled: boolean;
  winningOutcome: number | null;
  isPrivate: boolean;
  allowlist: string[];
  yesPotUsdc: number;
  noPotUsdc: number;
  totalPotUsdc: number;
  yesProb: number;
  createMarketTx: string;
  createdAt: string;
}

export interface CreatePredictionInput {
  slug: string;
  question: string;
  category: "Tournament" | "Player" | "Special";
  isPrivate: boolean;
  allowlist: string[];
}

export async function createPredictionMarket(
  input: CreatePredictionInput,
): Promise<{ ok: boolean; market?: PredictionMarketView; error?: string }> {
  const res = await fetch(`${API_URL}/admin/create-prediction-market`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.ok) return { ok: false, error: json.error ?? "Create failed" };
  return { ok: true, market: json.market };
}

/* ---- Stats (standings + top scorers) ---- */

export interface StandingsTeam {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  group: string;
  form: string | null;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
}

export async function fetchStandings(): Promise<StandingsTeam[][]> {
  const res = await fetch(`${API_URL}/stats/standings`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to load standings");
  return json.groups as StandingsTeam[][];
}

export interface TopScorerRow {
  id: number;
  name: string;
  photo: string;
  nationality: string;
  team: { id: number; name: string; logo: string } | null;
  goals: number;
  assists: number;
  appearances: number;
  minutes: number;
}

export async function fetchTopScorers(): Promise<TopScorerRow[]> {
  const res = await fetch(`${API_URL}/stats/top-scorers`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to load top scorers");
  return json.players as TopScorerRow[];
}

/* ---- Head-to-head ---- */

export interface H2HMatch {
  id: number;
  date: string;
  status: string;
  league: string;
  season: number;
  round: string;
  venue: string | null;
  home: { id: number; name: string; logo: string; goals: number | null };
  away: { id: number; name: string; logo: string; goals: number | null };
  penalty: { home: number; away: number } | null;
}

export interface H2HResult {
  summary: { total: number; aWins: number; bWins: number; draws: number };
  matches: H2HMatch[];
}

export async function fetchH2H(teamAId: number, teamBId: number): Promise<H2HResult> {
  const res = await fetch(`${API_URL}/fixtures/h2h?a=${teamAId}&b=${teamBId}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to load H2H");
  return { summary: json.summary, matches: json.matches };
}

export async function listPredictionMarkets(): Promise<PredictionMarketView[]> {
  const res = await fetch(`${API_URL}/prediction-markets`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to load prediction markets");
  return (json.markets as PredictionMarketView[]) ?? [];
}

/* ---- Player-prop aggregate (across all fixtures) ---- */

export async function listAllPlayerProps(): Promise<{
  id: string;
  fixtureId: number;
  type: string;
  marketId: number;
  settled: boolean;
  home: string;
  away: string;
  round: string;
  outcomeCount: number;
}[]> {
  const res = await fetch(`${API_URL}/player-prop-markets`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to load player props");
  return json.markets ?? [];
}

export async function listPlayerPropsForFixture(fixtureId: number): Promise<PlayerPropMarketView[]> {
  const res = await fetch(`${API_URL}/player-prop-markets/by-fixture/${fixtureId}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Failed to load player props");
  return (json.markets as PlayerPropMarketView[]) ?? [];
}

export async function copyStrategy(
  sourceId: string,
  walletAddress: string,
): Promise<{ ok: boolean; cloneId?: string; error?: string }> {
  const res = await fetch(`${API_URL}/strategies/${sourceId}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  const json = await res.json();
  if (!json.ok) return { ok: false, error: json.error ?? "Copy failed" };
  // Auto-activate the clone so it's immediately live.
  await fetch(`${API_URL}/strategies/${json.clone.id}/activate`, { method: "POST" });
  return { ok: true, cloneId: json.clone.id };
}

export function statusLabel(s: FixtureStatus): string {
  const map: Record<string, string> = {
    NS: "Upcoming",
    "1H": "Live · 1H",
    HT: "Half-time",
    "2H": "Live · 2H",
    ET: "Extra Time",
    P: "Penalties",
    BT: "Break",
    FT: "Final",
    AET: "After Extra Time",
    PEN: "After Penalties",
    PST: "Postponed",
    TBD: "TBD",
    CANC: "Cancelled",
    ABD: "Abandoned",
  };
  return map[s] ?? s;
}
