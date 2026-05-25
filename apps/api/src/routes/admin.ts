import { Router } from "express";
import { z } from "zod";
import { processMatchEvent } from "../lib/firing.js";
import { settleAndClaim } from "../lib/oracle.js";
import { syncFixtures, createMissingMarkets } from "../lib/fixtureSync.js";
import { fetchAccountStatus } from "../lib/apiFootball.js";
import { replayFixture } from "../lib/replay.js";
import { backfillTargets } from "../lib/strategyResolver.js";
import { fetchWCTeams, getCachedTeams } from "../lib/teams.js";
import { createTournamentMarkets, settleTournament } from "../lib/tournamentSync.js";
import { createFirstScorerMarkets } from "../lib/playerProps.js";
import {
  createPredictionMarket,
  seedDefaultPredictions,
  settlePredictionMarket,
} from "../lib/predictionMarkets.js";

export const adminRouter = Router();

/**
 * POST /admin/backfill-targets — re-resolve targetMarketIds for every existing
 * Strategy. Useful after wiping/seeding fixtures or after a deploy that
 * predated Phase-2 strategy ↔ fixture resolution.
 */
adminRouter.post("/backfill-targets", async (_req, res) => {
  try {
    const result = await backfillTargets();
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[POST /admin/backfill-targets]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/**
 * GET /admin/teams — view the currently-cached team list. Helpful for
 * debugging why a strategy resolved to N markets.
 */
adminRouter.get("/teams", async (_req, res) => {
  const cached = getCachedTeams();
  return res.json({ ok: true, cached: cached.length, teams: cached });
});

/**
 * POST /admin/teams/refresh — force a fresh fetch from API-Football.
 * Uses 1 of the daily 100 request budget.
 */
adminRouter.post("/teams/refresh", async (_req, res) => {
  try {
    const teams = await fetchWCTeams(true);
    return res.json({ ok: true, refreshed: teams.length });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/**
 * POST /admin/create-tournament-markets — Pillar 1 setup. Creates one binary
 * "Does <team> win the World Cup?" market per team in the cached team list.
 * Idempotent — skips teams that already have a market for the current season.
 */
adminRouter.post("/create-tournament-markets", async (_req, res) => {
  try {
    const created = await createTournamentMarkets();
    return res.json({ ok: true, created: created.length, markets: created });
  } catch (err: any) {
    console.error("[POST /admin/create-tournament-markets]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

const SettleTournamentSchema = z.object({
  winningTeamId: z.number().int().positive(),
});

/**
 * POST /admin/settle-tournament — end-of-tournament oracle action.
 * Settles every tournament-winner market: the winning team's market goes to
 * outcome 0 (YES), every other team's market to outcome 1 (NO).
 *
 * Stakers claim individually (UI button); this endpoint does NOT auto-claim
 * to avoid gas-billing the deployer for every staker across 32 markets.
 */
adminRouter.post("/settle-tournament", async (req, res) => {
  const body = SettleTournamentSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ ok: false, error: "invalid request", issues: body.error.flatten() });
  }
  try {
    const result = await settleTournament(body.data.winningTeamId);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[POST /admin/settle-tournament]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/**
 * GET /admin/api-status — API-Football account/quota debug info.
 * Useful for the dashboard or pre-flight checks.
 */
adminRouter.get("/api-status", async (_req, res) => {
  try {
    const status = await fetchAccountStatus();
    return res.json({ ok: true, ...status });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/**
 * POST /admin/sync-fixtures — pull every fixture for the configured WC season
 * from API-Football and upsert into the local Fixture table. Idempotent.
 */
adminRouter.post("/sync-fixtures", async (_req, res) => {
  try {
    const result = await syncFixtures();
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[POST /admin/sync-fixtures]", err);
    return res.status(502).json({ ok: false, error: err?.message ?? String(err) });
  }
});

const CreateMarketsSchema = z.object({
  max: z.number().int().positive().max(200).optional(),
});

/**
 * POST /admin/create-markets — for each Fixture without a FixtureMarket and
 * with future kickoff, call XCupMarket.createMarket. Returns the mapping.
 * Body: { max?: 20 } to throttle (default = all unmapped).
 */
adminRouter.post("/create-markets", async (req, res) => {
  const body = CreateMarketsSchema.safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ ok: false, error: "invalid request", issues: body.error.flatten() });

  try {
    const created = await createMissingMarkets(body.data.max);
    return res.json({ ok: true, created: created.length, markets: created });
  } catch (err: any) {
    console.error("[POST /admin/create-markets]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

const MatchEventSchema = z.object({
  marketId: z.number().int().positive(),
  winningOutcomeIdx: z.number().int().min(0).max(7),
  homeTeam: z.string().min(2).max(32),
  awayTeam: z.string().min(2).max(32),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
  scorers: z.array(z.string()).max(20).default([]),
});

/**
 * POST /admin/match-event
 *
 * Demo-mode trigger: push a synthetic match result and have the watch loop
 * fire every active strategy whose trigger matches. Per the spec's Risk 2
 * mitigation, this is the override path we use when API-Football is down OR
 * when we want a reproducible demo flow.
 *
 * In production this endpoint is internal — auth-gated to an admin token.
 * For the hackathon it's open under /admin/* — keep that in mind.
 */
adminRouter.post("/match-event", async (req, res) => {
  const body = MatchEventSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ ok: false, error: "invalid match event", issues: body.error.flatten() });
  }
  try {
    const fires = await processMatchEvent(body.data);
    return res.json({ ok: true, eventProcessed: body.data, fires });
  } catch (err: any) {
    console.error("[POST /admin/match-event]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "internal error" });
  }
});

const SettleSchema = z.object({
  marketId: z.number().int().positive(),
  winningOutcomeIdx: z.number().int().min(0).max(7),
});

/**
 * POST /admin/settle — phase C + D in one shot:
 *   1. Settle the market on-chain (deployer/oracle signature)
 *   2. Auto-claim for every strategy that bet on the winning outcome
 *
 * In production: a real oracle (Chainlink Functions or similar) gates this
 * with verifiable match result attestation. For the hackathon: open admin
 * endpoint per spec's explicit scope-cut.
 */
adminRouter.post("/settle", async (req, res) => {
  const body = SettleSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ ok: false, error: "invalid request", issues: body.error.flatten() });
  }
  try {
    const result = await settleAndClaim(body.data.marketId, body.data.winningOutcomeIdx);
    return res.json(result);
  } catch (err: any) {
    console.error("[POST /admin/settle]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "internal error" });
  }
});

/**
 * POST /admin/replay-fixture/:id
 *
 * The Phase-2 "magic moment" endpoint. Takes a finished fixture, derives its
 * real outcome from API-Football data, fires any matching strategies, then
 * settles the on-chain market and auto-claims for winners.
 *
 *   curl -X POST http://localhost:4000/admin/replay-fixture/855736
 *
 * For the WC 2022 demo this is what the UI's "Replay this match" button calls.
 * For live WC 2026 this same logic gets invoked automatically by the polling
 * cron when a fixture transitions to FT / AET / PEN.
 */
adminRouter.post("/replay-fixture/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "invalid fixture id" });
  }
  try {
    const result = await replayFixture(id);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[POST /admin/replay-fixture]", err);
    return res.status(400).json({ ok: false, error: err?.message ?? "internal error" });
  }
});

const FirstScorerSchema = z.object({
  fixtureIds: z.array(z.number().int().positive()).optional(),
  limit: z.number().int().positive().max(30).optional(),
});

/**
 * POST /admin/create-first-scorer-markets
 *
 * Builds per-fixture "Who scores first?" markets. For each eligible fixture
 * (FT/AET/PEN status, not yet mapped), fetches its goal events from
 * API-Football and creates an on-chain market with one outcome per distinct
 * scorer (cap 7) plus "Other / no scorer".
 *
 * Body: { fixtureIds?: [int], limit?: int }
 *   - fixtureIds: only create markets for these fixtures (recommended for
 *     quota — e.g. just the knockout matches)
 *   - limit: cap how many fixtures to process (default 30)
 *
 * Costs ~1 API request per fixture processed. Watch /admin/api-status budget.
 */
adminRouter.post("/create-first-scorer-markets", async (req, res) => {
  const body = FirstScorerSchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ ok: false, error: "invalid request", issues: body.error.flatten() });
  }
  try {
    const result = await createFirstScorerMarkets(body.data);
    return res.json({
      ok: true,
      created: result.created.length,
      skipped: result.skipped,
      failed: result.failed,
      markets: result.created,
    });
  } catch (err: any) {
    console.error("[POST /admin/create-first-scorer-markets]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

const CreatePredictionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be kebab-case alphanumeric"),
  question: z.string().min(8).max(280),
  category: z.enum(["Tournament", "Player", "Special"]).optional(),
  isPrivate: z.boolean().optional(),
  allowlist: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).optional(),
});

/**
 * POST /admin/create-prediction-market — create a single opinion-style binary
 * market (YES/NO). Use `isPrivate: true` + allowlist for friend-only markets.
 */
adminRouter.post("/create-prediction-market", async (req, res) => {
  const body = CreatePredictionSchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ ok: false, error: "invalid request", issues: body.error.flatten() });
  }
  try {
    const created = await createPredictionMarket(body.data);
    return res.json({ ok: true, market: created });
  } catch (err: any) {
    console.error("[POST /admin/create-prediction-market]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/** POST /admin/seed-predictions — create the 5 default WC 2022 prediction markets. Idempotent. */
adminRouter.post("/seed-predictions", async (_req, res) => {
  try {
    const created = await seedDefaultPredictions();
    return res.json({ ok: true, count: created.length, markets: created });
  } catch (err: any) {
    console.error("[POST /admin/seed-predictions]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

const SettlePredictionSchema = z.object({
  slug: z.string(),
  winningOutcome: z.number().int().min(0).max(1),
});

/** POST /admin/settle-prediction — resolve a prediction market YES (0) or NO (1). */
adminRouter.post("/settle-prediction", async (req, res) => {
  const body = SettlePredictionSchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ ok: false, error: "invalid request", issues: body.error.flatten() });
  }
  try {
    const result = await settlePredictionMarket(body.data.slug, body.data.winningOutcome);
    return res.json(result);
  } catch (err: any) {
    console.error("[POST /admin/settle-prediction]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});
