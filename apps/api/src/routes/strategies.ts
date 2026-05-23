import { Router } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import { ParsedStrategy } from "@x-cup/types";
import { prisma } from "../db.js";
import { parseStrategy } from "../parser.js";
import { ensureUserWithAgent } from "../lib/burner.js";

export const strategiesRouter = Router();

const ParseRequest = z.object({
  text: z.string().min(8, "strategy text is too short").max(1000, "strategy text is too long"),
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "walletAddress must be a 0x EVM address")
    .optional(),
});

/**
 * POST /strategies/parse — stateless parse for the live preview.
 */
strategiesRouter.post("/parse", async (req, res) => {
  const body = ParseRequest.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ ok: false, error: "invalid request", issues: body.error.flatten() });
  }
  try {
    const result = await parseStrategy(body.data.text);
    if (!result.ok) return res.status(422).json(result);
    return res.json(result);
  } catch (err) {
    console.error("[POST /strategies/parse]", err);
    return res.status(502).json({
      ok: false,
      error: "parser upstream failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Strategy CRUD                                                              */
/* -------------------------------------------------------------------------- */

const DeployRequest = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  text: z.string().min(8).max(1000),
  parsed: z.unknown(), // already-parsed JSON from the frontend's live preview
});

/**
 * POST /strategies — persist a strategy in `draft` state (not yet firing).
 * Body: { walletAddress, text, parsed }. Validates the parsed JSON server-side.
 */
strategiesRouter.post("/", async (req, res) => {
  const body = DeployRequest.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ ok: false, error: "invalid request", issues: body.error.flatten() });
  }
  const validated = ParsedStrategy.safeParse(body.data.parsed);
  if (!validated.success) {
    return res
      .status(422)
      .json({ ok: false, error: "parsed strategy failed validation", issues: validated.error.issues });
  }

  try {
    const checksum = ethers.getAddress(body.data.walletAddress);
    const user = await ensureUserWithAgent(checksum);
    const dbUser = await prisma.user.findUnique({ where: { mainWallet: user.mainWallet } });
    if (!dbUser) return res.status(500).json({ ok: false, error: "user upsert failed" });

    const strategy = await prisma.strategy.create({
      data: {
        userId: dbUser.id,
        englishText: body.data.text,
        parsedJson: JSON.stringify(validated.data),
        status: "draft",
        maxLossUsdc: validated.data.riskLimits.maxLossUsdc ?? null,
      },
    });
    return res.json({ ok: true, strategy: serializeStrategy(strategy) });
  } catch (err: any) {
    console.error("[POST /strategies]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "internal error" });
  }
});

/**
 * POST /strategies/:id/activate — flip status to `active`. From here the
 * watch loop (or POST /admin/match-event in demo mode) can fire it.
 */
strategiesRouter.post("/:id/activate", async (req, res) => {
  const id = String(req.params.id ?? "");
  try {
    const existing = await prisma.strategy.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ ok: false, error: "strategy not found" });

    const strategy = await prisma.strategy.update({
      where: { id },
      data: { status: "active" },
    });
    return res.json({ ok: true, strategy: serializeStrategy(strategy) });
  } catch (err: any) {
    console.error("[POST /strategies/:id/activate]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "internal error" });
  }
});

/**
 * GET /strategies?wallet=0x... — list strategies for a given wallet, newest first.
 */
strategiesRouter.get("/", async (req, res) => {
  const wallet = String(req.query.wallet ?? "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ ok: false, error: "wallet query param required" });
  }
  const checksum = ethers.getAddress(wallet);
  const user = await prisma.user.findUnique({ where: { mainWallet: checksum } });
  if (!user) return res.json({ ok: true, strategies: [] });
  const strategies = await prisma.strategy.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ ok: true, strategies: strategies.map(serializeStrategy) });
});

/**
 * GET /strategies/:id/fires — list all fires for a strategy, newest first.
 * Used by the agent activity dashboard.
 */
strategiesRouter.get("/:id/fires", async (req, res) => {
  const id = String(req.params.id ?? "");
  const fires = await prisma.strategyFire.findMany({
    where: { strategyId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return res.json({ ok: true, fires: fires.map(serializeFire) });
});

/**
 * GET /strategies/fires?wallet=0x... — list every fire across every strategy
 * owned by a given wallet. Convenience endpoint for the activity dashboard.
 */
strategiesRouter.get("/fires/by-wallet", async (req, res) => {
  const wallet = String(req.query.wallet ?? "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ ok: false, error: "wallet query param required" });
  }
  const checksum = ethers.getAddress(wallet);
  const user = await prisma.user.findUnique({ where: { mainWallet: checksum } });
  if (!user) return res.json({ ok: true, fires: [] });
  const strategies = await prisma.strategy.findMany({ where: { userId: user.id }, select: { id: true } });
  const fires = await prisma.strategyFire.findMany({
    where: { strategyId: { in: strategies.map((s) => s.id) } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return res.json({ ok: true, fires: fires.map(serializeFire) });
});

/* -------------------------------------------------------------------------- */
/* Serializers                                                                */
/* -------------------------------------------------------------------------- */

function serializeStrategy(s: {
  id: string;
  englishText: string;
  parsedJson: string;
  status: string;
  fireCount: number;
  maxLossUsdc: number | null;
  currentPnlUsdc: number;
  createdAt: Date;
}) {
  return {
    id: s.id,
    englishText: s.englishText,
    parsed: JSON.parse(s.parsedJson),
    status: s.status,
    fireCount: s.fireCount,
    maxLossUsdc: s.maxLossUsdc,
    currentPnlUsdc: s.currentPnlUsdc,
    createdAt: s.createdAt.toISOString(),
  };
}

function serializeFire(f: {
  id: string;
  strategyId: string;
  marketId: number;
  outcomeIdx: number;
  stakeUsdc: number;
  txHash: string | null;
  status: string;
  failureReason: string | null;
  matchEventJson: string;
  createdAt: Date;
}) {
  return {
    id: f.id,
    strategyId: f.strategyId,
    marketId: f.marketId,
    outcomeIdx: f.outcomeIdx,
    stakeUsdc: f.stakeUsdc,
    txHash: f.txHash,
    status: f.status,
    failureReason: f.failureReason,
    matchEvent: JSON.parse(f.matchEventJson),
    createdAt: f.createdAt.toISOString(),
  };
}
