import { prisma } from "../db.js";
import { extractScorers, fetchFixture, fixtureToOutcomeIdx, type ApiFixtureRaw } from "./apiFootball.js";
import { processMatchEvent, processPlayerPropEvent, type FireResult } from "./firing.js";
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
  propFires?: FireResult[];
  propClaims?: SettleResult | null;
  tournamentFires?: FireResult[];
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

  // Phase B' — fire any strategy targeting the player-prop market for this
  // fixture (e.g. "If Messi scores"). Lookup the PPM by fixtureId first.
  const propFires: FireResult[] = [];
  if (matchEvent.scorers.length > 0) {
    const { prisma } = await import("../db.js");
    const ppm = await prisma.playerPropMarket.findUnique({
      where: { fixtureId_type: { fixtureId, type: "first_scorer" } },
    });
    if (ppm) {
      const fired = await processPlayerPropEvent({
        marketId: ppm.marketId,
        firstScorer: matchEvent.scorers[0]!,
        scorers: matchEvent.scorers,
        homeTeam: matchEvent.homeTeam,
        awayTeam: matchEvent.awayTeam,
      });
      propFires.push(...fired);
    }
  }

  // Phase B'' — fire on tournament-winner / to-reach-final markets when the
  // round + winner combo unlocks them.
  //   - Round of 16 / QF / SF win → fires on the winner's to-reach-final market
  //   - Final win                  → fires on the winner's tournament-winner market
  // The strategy's targetMarketIds already includes these (resolver does it
  // when any team is mentioned), so we just need to build the events.
  const tournamentFires: FireResult[] = [];
  const winnerTeamName = (() => {
    if (matchEvent.homeScore > matchEvent.awayScore) return matchEvent.homeTeam;
    if (matchEvent.awayScore > matchEvent.homeScore) return matchEvent.awayTeam;
    if (matchEvent.penaltyHome != null && matchEvent.penaltyAway != null) {
      return matchEvent.penaltyHome > matchEvent.penaltyAway ? matchEvent.homeTeam : matchEvent.awayTeam;
    }
    return null;
  })();
  if (winnerTeamName) {
    const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const winNorm = norm(winnerTeamName);
    const isFinal = /^final$/i.test(fixture.round);
    const isSemi = /semi/i.test(fixture.round);

    if (isFinal || isSemi) {
      const tmType = isFinal ? "winner" : "to_reach_final";
      const tournamentMarkets = await prisma.tournamentMarket.findMany({
        where: { type: tmType },
      });
      const tmForWinner = tournamentMarkets.find((t) => {
        const tn = norm(t.teamName);
        return tn.includes(winNorm) || winNorm.includes(tn);
      });
      if (tmForWinner) {
        // Build a tournament-event: same teams + scores, but redirect the
        // marketId + winningOutcomeIdx to the tournament market (YES = 0).
        const tournamentEvent = { ...matchEvent, marketId: tmForWinner.marketId, winningOutcomeIdx: 0 };
        const tFires = await processMatchEvent(tournamentEvent);
        tournamentFires.push(...tFires);
      }
    }
  }

  // Phase C + D — settle the market, auto-claim for winners.
  const settle = await settleAndClaim(matchEvent.marketId, matchEvent.winningOutcomeIdx);

  // Phase E — settle any player-prop markets on this fixture too (first-scorer
  // markets are settled with the actual first goal scorer from raw.events).
  const propSettle = await settleFirstScorerMarket(fixtureId, raw);

  // Phase F — auto-claim player-prop winners. Run settleAndClaim on the
  // player-prop market id so winners get their payout in the same flow.
  let propClaims: any = null;
  if (propSettle.ok && propSettle.winningOutcome !== undefined) {
    const { prisma } = await import("../db.js");
    const ppm = await prisma.playerPropMarket.findUnique({
      where: { fixtureId_type: { fixtureId, type: "first_scorer" } },
    });
    if (ppm) {
      propClaims = await settleAndClaim(ppm.marketId, propSettle.winningOutcome);
    }
  }

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
    propFires,
    propClaims,
    tournamentFires,
  };
}
