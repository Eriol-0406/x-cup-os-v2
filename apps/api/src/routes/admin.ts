import { Router } from "express";
import { z } from "zod";
import { processMatchEvent } from "../lib/firing.js";

export const adminRouter = Router();

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
