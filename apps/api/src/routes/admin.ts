import { Router } from "express";
import { z } from "zod";
import { processMatchEvent } from "../lib/firing.js";
import { settleAndClaim } from "../lib/oracle.js";
import { syncFixtures, createMissingMarkets } from "../lib/fixtureSync.js";
import { fetchAccountStatus } from "../lib/apiFootball.js";
import { replayFixture } from "../lib/replay.js";

export const adminRouter = Router();

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
