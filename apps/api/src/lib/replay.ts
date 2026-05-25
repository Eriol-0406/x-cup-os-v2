import { prisma } from "../db.js";
import { extractScorers, fetchFixture, fixtureToOutcomeIdx, type ApiFixtureRaw } from "./apiFootball.js";
import { processMatchEvent, type FireResult } from "./firing.js";
import { settleAndClaim, type SettleResult } from "./oracle.js";
import { settleFirstScorerMarket } from "./playerProps.js";

/**
 * Replay a historical (finished) fixture: pull its real outcome, fire any
 * strategy whose trigger matches, then settle the on-chain market with the
 * actual winner so the auto-claim cascade runs.
 *
 * This is the demo flow for WC 2022 — every match already finished, so the
 * outcome is deterministic. For live WC 2026 the same logic will be invoked
 * automatically by the live-polling cron when a fixture transitions to FT.
 *
 *   1. Resolve fixture + on-chain market (FixtureMarket mapping)
 *   2. Optionally hit /fixtures?id=X for goal events (scorers) if missing
 *      from the cached rawJson — costs 1 API request per replay
 *   3. Build MatchEvent { marketId, winningOutcomeIdx, teams, scores, scorers }
 *   4. processMatchEvent → fires matching active strategies (stake on-chain)
 *   5. settleAndClaim → oracle settles + auto-claims for winners
 */

export interface ReplayResult {
  fixture: { id: number; status: string; home: string; away: string; score: string };
  matchEvent: {
    marketId: number;
    winningOutcomeIdx: number;
    scorers: string[];
  };
  fires: FireResult[];
  settle: SettleResult;
  propSettle?: { ok: boolean; reason?: string; txHash?: string; winningOutcome?: number; winningPlayer?: string };
}

export async function replayFixture(fixtureId: number): Promise<ReplayResult> {
  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    include: { market: true },
  });
  if (!fixture) throw new Error(`Fixture ${fixtureId} not found in DB — run /admin/sync-fixtures first`);
  if (!fixture.market) {
    throw new Error(`Fixture ${fixtureId} has no on-chain market — run /admin/create-markets first`);
  }

  let raw = JSON.parse(fixture.rawJson) as ApiFixtureRaw;

  // The bulk /fixtures?league=X&season=Y call doesn't include events. Hit the
  // single-fixture endpoint to populate scorers (1 API request). If it fails
  // or returns no events we fall back to the cached fixture without scorers
  // — match_winner / score_threshold triggers still work.
  if (!raw.events) {
    try {
      const fresh = await fetchFixture(fixtureId);
      if (fresh) raw = fresh;
    } catch (err) {
      console.warn(`[replayFixture] couldn't refresh events for ${fixtureId}:`, err);
    }
  }

  const outcomeCount = fixture.market.outcomeCount;
  const winningOutcomeIdx = fixtureToOutcomeIdx(raw, outcomeCount);
  if (winningOutcomeIdx === null) {
    throw new Error(
      `Fixture ${fixtureId} is not in a settle-able state (status: ${fixture.status}). ` +
        `Only FT / AET / PEN can be replayed.`,
    );
  }

  const matchEvent = {
    marketId: fixture.market.marketId,
    winningOutcomeIdx,
    homeTeam: fixture.homeTeamName,
    awayTeam: fixture.awayTeamName,
    homeScore: fixture.homeGoals ?? 0,
    awayScore: fixture.awayGoals ?? 0,
    penaltyHome: fixture.penaltyHome ?? undefined,
    penaltyAway: fixture.penaltyAway ?? undefined,
    scorers: extractScorers(raw),
  };

  // Phase B — fire any strategy whose trigger matches this outcome.
  const fires = await processMatchEvent(matchEvent);

  // Phase C + D — settle the market, auto-claim for winners.
  const settle = await settleAndClaim(matchEvent.marketId, matchEvent.winningOutcomeIdx);

  // Phase E — settle any player-prop markets on this fixture too (first-scorer
  // markets are settled with the actual first goal scorer from raw.events).
  const propSettle = await settleFirstScorerMarket(fixtureId, raw);

  return {
    fixture: {
      id: fixture.id,
      status: fixture.status,
      home: fixture.homeTeamName,
      away: fixture.awayTeamName,
      score: `${fixture.homeGoals ?? 0}-${fixture.awayGoals ?? 0}` +
        (fixture.penaltyHome !== null ? ` (P ${fixture.penaltyHome}-${fixture.penaltyAway})` : ""),
    },
    matchEvent: {
      marketId: matchEvent.marketId,
      winningOutcomeIdx: matchEvent.winningOutcomeIdx,
      scorers: matchEvent.scorers,
    },
    fires,
    settle,
    propSettle,
  };
}
