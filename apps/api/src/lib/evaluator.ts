import type { ParsedStrategy, TriggerCondition } from "@x-cup/types";

/**
 * A match event — the input to the watch loop. In production this would come
 * from API-Football polling. For the demo we accept it via POST /admin/match-event.
 *
 * normalizedTeams uses upper-case short codes ("ARG", "FRA", "ENG", etc) so the
 * evaluator can compare against the user's "Argentina"/"France" strings after
 * a simple normalize() step.
 */
export interface MatchEvent {
  /** On-chain marketId to fire stakes onto. */
  marketId: number;
  /** Outcome index that won (0/1 for binary, 0/1/2 for ternary). */
  winningOutcomeIdx: number;
  /** Home and away team display names (for trigger matching). */
  homeTeam: string;
  awayTeam: string;
  /** Regulation-time final scores. */
  homeScore: number;
  awayScore: number;
  /** Penalty shootout result (only present when status == PEN). */
  penaltyHome?: number;
  penaltyAway?: number;
  /** Players who scored. */
  scorers: string[];
}

const TEAM_CODE: Record<string, string> = {
  argentina: "ARG", arg: "ARG",
  france: "FRA", fra: "FRA",
  england: "ENG", eng: "ENG", "ï½¥": "ENG",
  brazil: "BRA", bra: "BRA",
  germany: "GER", ger: "GER",
  spain: "ESP", esp: "ESP",
  portugal: "POR", por: "POR",
  italy: "ITA", ita: "ITA",
  netherlands: "NED", ned: "NED",
  croatia: "CRO", cro: "CRO",
  morocco: "MAR", mar: "MAR",
  japan: "JPN", jpn: "JPN",
  korea: "KOR", kor: "KOR",
  mexico: "MEX", mex: "MEX",
  usa: "USA",
};

function normalizeTeam(s: string): string {
  const lower = s.trim().toLowerCase();
  if (TEAM_CODE[lower]) return TEAM_CODE[lower];
  if (/^[a-z]{3}$/i.test(lower)) return lower.toUpperCase();
  return lower; // fallback — won't match team codes
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Evaluate a single condition against a match event.
 * Returns true if the condition is satisfied by what happened in the match.
 */
function evalCondition(c: TriggerCondition, ev: MatchEvent): boolean {
  switch (c.kind) {
    case "match_winner": {
      const team = normalizeTeam(c.team);
      const home = normalizeTeam(ev.homeTeam);
      const away = normalizeTeam(ev.awayTeam);
      let winner: string | null = null;
      if (ev.homeScore > ev.awayScore) winner = home;
      else if (ev.awayScore > ev.homeScore) winner = away;
      else if (ev.penaltyHome != null && ev.penaltyAway != null) {
        // Regulation draw, decided by penalties (knockout). For group-stage
        // draws (no penalties), winner stays null → trigger doesn't match.
        winner = ev.penaltyHome > ev.penaltyAway ? home : away;
      }
      return winner !== null && winner === team;
    }
    case "player_scores": {
      const target = normalizeName(c.player);
      return ev.scorers.some((p) => normalizeName(p).includes(target) || target.includes(normalizeName(p)));
    }
    case "score_threshold": {
      const team = normalizeTeam(c.team);
      const home = normalizeTeam(ev.homeTeam);
      const away = normalizeTeam(ev.awayTeam);
      const score = team === home ? ev.homeScore : team === away ? ev.awayScore : null;
      if (score === null) return false;
      switch (c.operator) {
        case ">=": return score >= c.goals;
        case ">":  return score > c.goals;
        case "==": return score === c.goals;
        case "<":  return score < c.goals;
        case "<=": return score <= c.goals;
      }
    }
  }
}

/**
 * Does the parsed strategy's trigger fire for this event?
 * AND combinator → every condition must pass. OR → any one.
 */
export function triggerMatches(parsed: ParsedStrategy, ev: MatchEvent): boolean {
  const results = parsed.trigger.conditions.map((c) => evalCondition(c, ev));
  if (parsed.trigger.combinator === "OR") return results.some(Boolean);
  return results.every(Boolean);
}

/**
 * Map the strategy's "YES" / "NO" outcome string to the outcomeIdx the user
 * would have bet on. v1 only supports binary markets (idx 0/1) — for ternary
 * markets we'd need richer Action types.
 */
export function actionOutcomeIdx(parsed: ParsedStrategy): number {
  return parsed.action.outcome === "YES" ? 0 : 1;
}
