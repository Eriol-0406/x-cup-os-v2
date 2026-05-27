/**
 * Per-category fee schedule (basis points) applied at market creation time.
 *
 * The fee is deducted from every winning claim's gross payout and forwarded to
 * the contract's `treasury`. Higher fees are charged on easier-to-price markets
 * (1x2 has lots of liquidity + obvious odds, so the protocol takes more vig);
 * lower fees on harder outright markets (top scorer, tournament winner) keep
 * sharp bettors interested in finding edge.
 *
 * Capped at contract's MAX_FEE_BPS = 500 (5%). Update here in one place to
 * shift the entire vig profile.
 */
export const MarketFees = {
  /** 1x2 per-fixture match-winner markets. */
  FIXTURE_1X2: 180,
  /** Over/Under 2.5 goals per-fixture. */
  OVER_UNDER_25: 160,
  /** Both Teams To Score per-fixture. */
  BTTS: 160,
  /** First goalscorer player props per knockout fixture. */
  FIRST_SCORER: 140,
  /** Per-team tournament winner outright. */
  TOURNAMENT_WINNER: 120,
  /** Per-team to-reach-final outright. */
  TO_REACH_FINAL: 110,
  /** Multi-outcome per-group winner. */
  GROUP_WINNER: 130,
  /** Tournament-wide top goalscorer multi-outcome (hardest call, lowest vig). */
  TOP_SCORER: 90,
  /** Yes/No opinion markets ("Will an unbeaten champion emerge?", etc). */
  PREDICTION_OPINION: 100,
} as const;

export type MarketCategory = keyof typeof MarketFees;
