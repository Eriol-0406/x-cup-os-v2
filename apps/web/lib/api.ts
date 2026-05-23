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
