import type { ParsedStrategy } from "@x-cup/types";
import { prisma } from "../db.js";

/**
 * Resolve a parsed strategy's team mentions into a list of on-chain marketIds
 * the strategy is allowed to fire on.
 *
 *   - Extract team names from parsed.trigger.conditions
 *   - For each team: find every Fixture where home OR away matches (case-insensitive
 *     contains compare — handles "Argentina" matching "Argentina", and "France"
 *     matching "France" even if the LLM emits "FRA" or "Les Bleus")
 *   - For each matching fixture, take its FixtureMarket.marketId
 *   - Dedupe + return
 *
 * Returns [] if no fixtures match — in that case the strategy still saves but
 * won't fire on any event (we surface this to the user at deploy time).
 *
 * Edge cases handled:
 *   - score_threshold conditions reference a team → included
 *   - player_scores conditions DON'T name a team → we keep the targetMarketIds
 *     wide unless a team was named in another condition. If the strategy ONLY
 *     mentions a player, targets stay empty and the strategy won't fire. The
 *     LLM prompt should encourage users to name a team alongside any player.
 */
export async function resolveStrategyTargets(parsed: ParsedStrategy): Promise<number[]> {
  const teamMentions = new Set<string>();
  const playerMentions = new Set<string>();
  for (const c of parsed.trigger.conditions) {
    if (c.kind === "match_winner") teamMentions.add(c.team);
    if (c.kind === "score_threshold") teamMentions.add(c.team);
    if (c.kind === "player_scores") playerMentions.add(c.player);
  }
  if (teamMentions.size === 0 && playerMentions.size === 0) return [];

  const matched = new Set<number>();

  // 1. Match-winner markets keyed by team mention
  if (teamMentions.size > 0) {
    const fixturesWithMarket = await prisma.fixture.findMany({
      where: { market: { isNot: null } },
      include: { market: true },
    });
    for (const f of fixturesWithMarket) {
      if (!f.market) continue;
      const home = f.homeTeamName.toLowerCase();
      const away = f.awayTeamName.toLowerCase();
      for (const team of teamMentions) {
        const t = team.toLowerCase();
        if (home.includes(t) || t.includes(home) || away.includes(t) || t.includes(away)) {
          matched.add(f.market.marketId);
          break;
        }
      }
    }
  }

  // 2. Player-prop markets keyed by player mention — if a strategy says
  // "if Messi scores", we also include any first-scorer market where Messi
  // is one of the named outcomes.
  if (playerMentions.size > 0) {
    const props = await prisma.playerPropMarket.findMany();
    for (const p of props) {
      const outcomes = JSON.parse(p.outcomesJson) as Array<{ playerName?: string }>;
      for (const player of playerMentions) {
        const pl = player.toLowerCase();
        const hit = outcomes.some(
          (o) =>
            o.playerName &&
            (o.playerName.toLowerCase().includes(pl) || pl.includes(o.playerName.toLowerCase())),
        );
        if (hit) {
          matched.add(p.marketId);
          break;
        }
      }
    }
  }

  return [...matched].sort((a, b) => a - b);
}

/**
 * Backfill: re-resolve targetMarketIds for every existing strategy. Useful
 * after fixture sync changes (new fixtures added) or after a deploy that
 * predated the resolver.
 */
export async function backfillTargets(): Promise<{ updated: number }> {
  const strategies = await prisma.strategy.findMany();
  let updated = 0;
  for (const s of strategies) {
    try {
      const parsed = JSON.parse(s.parsedJson) as ParsedStrategy;
      const targets = await resolveStrategyTargets(parsed);
      await prisma.strategy.update({
        where: { id: s.id },
        data: { targetMarketIds: JSON.stringify(targets) },
      });
      updated++;
    } catch (err) {
      console.warn(`[backfillTargets] strategy ${s.id} failed:`, err);
    }
  }
  return { updated };
}
