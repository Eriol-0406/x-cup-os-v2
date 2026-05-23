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
