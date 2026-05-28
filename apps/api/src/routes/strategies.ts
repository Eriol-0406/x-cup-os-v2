import { Router } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import { ParsedStrategy } from "@x-cup/types";
import { prisma } from "../db.js";
import { parseStrategy } from "../parser.js";
import { ensureUserWithAgent } from "../lib/burner.js";
import { resolveStrategyTargets } from "../lib/strategyResolver.js";

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

    // Per-wallet cap. Open-to-strangers safety: prevents a single wallet from
    // spamming strategies (which would burn the shared Groq quota and clutter
    // the leaderboard). Counts `active` + `exhausted` — both occupy a "slot"
    // until the user manually pauses or deletes one. `draft` doesn't count
    // since it hasn't been deployed yet.
    const MAX_ACTIVE_STRATEGIES = 5;
    const activeCount = await prisma.strategy.count({
      where: { userId: dbUser.id, status: { in: ["active", "exhausted"] } },
    });
    if (activeCount >= MAX_ACTIVE_STRATEGIES) {
      return res.status(429).json({
        ok: false,
        error: `You already have ${activeCount} active strategies (max ${MAX_ACTIVE_STRATEGIES}). Pause or delete one before deploying a new one.`,
      });
    }

    // Phase-2: resolve team mentions → on-chain marketIds at deploy time.
    // If empty, the strategy still saves but won't fire (frontend warns the user).
    const targetMarketIds = await resolveStrategyTargets(validated.data);

    const strategy = await prisma.strategy.create({
      data: {
        userId: dbUser.id,
        englishText: body.data.text,
        parsedJson: JSON.stringify(validated.data),
        status: "draft",
        maxLossUsdc: validated.data.riskLimits.maxLossUsdc ?? null,
        targetMarketIds: JSON.stringify(targetMarketIds),
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
 * GET /strategies/leaderboard?limit=20 — top strategies ranked by
 * currentPnlUsdc DESC (then fireCount DESC as tiebreak). Returns anonymized
 * owner addresses (0x1234…ab12 format). Powers the public leaderboard
 * section in the UI — Pillar 3 social proof.
 */
strategiesRouter.get("/leaderboard", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
  const strategies = await prisma.strategy.findMany({
    where: { status: { in: ["active", "exhausted"] } },
    include: { user: { select: { mainWallet: true } }, _count: { select: { fires: true, claims: true } } },
    orderBy: [{ currentPnlUsdc: "desc" }, { fireCount: "desc" }, { createdAt: "asc" }],
    take: limit,
  });
  return res.json({
    ok: true,
    count: strategies.length,
    leaderboard: strategies.map((s, idx) => ({
      rank: idx + 1,
      strategyId: s.id,
      ownerShort: shortAddr(s.user.mainWallet),
      ownerFull: s.user.mainWallet,
      englishText: s.englishText,
      status: s.status,
      fireCount: s.fireCount,
      claimCount: s._count.claims,
      currentPnlUsdc: s.currentPnlUsdc,
      maxLossUsdc: s.maxLossUsdc,
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

const CopyRequest = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

/**
 * POST /strategies/:id/copy — clone a strategy's parsedJson + englishText into
 * the requesting user's account. The clone starts as `draft` (must be
 * activated separately) and re-resolves its own targetMarketIds (same teams,
 * same on-chain markets, but fresh row owned by the new user).
 */
strategiesRouter.post("/:id/copy", async (req, res) => {
  const body = CopyRequest.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ ok: false, error: "invalid request", issues: body.error.flatten() });
  }
  const sourceId = String(req.params.id ?? "");
  try {
    const source = await prisma.strategy.findUnique({ where: { id: sourceId } });
    if (!source) return res.status(404).json({ ok: false, error: "source strategy not found" });

    const checksum = ethers.getAddress(body.data.walletAddress);
    const user = await ensureUserWithAgent(checksum);
    const dbUser = await prisma.user.findUnique({ where: { mainWallet: user.mainWallet } });
    if (!dbUser) return res.status(500).json({ ok: false, error: "user upsert failed" });

    const parsed = JSON.parse(source.parsedJson);
    const targetMarketIds = await resolveStrategyTargets(parsed);

    const clone = await prisma.strategy.create({
      data: {
        userId: dbUser.id,
        englishText: source.englishText,
        parsedJson: source.parsedJson,
        status: "draft",
        maxLossUsdc: source.maxLossUsdc,
        targetMarketIds: JSON.stringify(targetMarketIds),
      },
    });
    return res.json({
      ok: true,
      sourceId,
      clone: serializeStrategy(clone),
    });
  } catch (err: any) {
    console.error("[POST /strategies/:id/copy]", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "internal error" });
  }
});

function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

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

  // Enrich each fire with human-readable market context. Look up the marketId
  // across all 5 market-source tables (FixtureMarket, PlayerPropMarket,
  // TournamentMarket, TournamentSpecial, PredictionMarket) and return a
  // marketRef { type, label, secondary } block so the activity dashboard can
  // show "ARG vs FRA · 1x2" instead of just "Market #64".
  const marketIds = [...new Set(fires.map((f) => f.marketId))];

  const [fixMarkets, propMarkets, tourMarkets, specials, predictions] = await Promise.all([
    prisma.fixtureMarket.findMany({
      where: { marketId: { in: marketIds } },
      include: { fixture: { select: { homeTeamName: true, awayTeamName: true, round: true, date: true } } },
    }),
    prisma.playerPropMarket.findMany({
      where: { marketId: { in: marketIds } },
      include: { fixture: { select: { homeTeamName: true, awayTeamName: true, round: true } } },
    }),
    prisma.tournamentMarket.findMany({ where: { marketId: { in: marketIds } } }),
    prisma.tournamentSpecial.findMany({ where: { marketId: { in: marketIds } } }),
    prisma.predictionMarket.findMany({ where: { marketId: { in: marketIds } } }),
  ]);

  type MarketRef = { type: string; label: string; secondary?: string };
  const refByMarket = new Map<number, MarketRef>();

  for (const fm of fixMarkets) {
    refByMarket.set(fm.marketId, {
      type: fm.outcomeCount === 3 ? "1X2" : "Knockout",
      label: `${fm.fixture.homeTeamName} vs ${fm.fixture.awayTeamName}`,
      secondary: fm.fixture.round,
    });
  }
  for (const pm of propMarkets) {
    const typeLabel = pm.type === "first_scorer" ? "First scorer" : pm.type === "over_under_25" ? "Over/Under 2.5" : pm.type === "btts" ? "Both teams score" : pm.type;
    refByMarket.set(pm.marketId, {
      type: typeLabel,
      label: `${pm.fixture.homeTeamName} vs ${pm.fixture.awayTeamName}`,
      secondary: pm.fixture.round,
    });
  }
  for (const tm of tourMarkets) {
    const typeLabel = tm.type === "winner" ? "Win Tournament" : tm.type === "to_reach_final" ? "Reach Final" : tm.type;
    refByMarket.set(tm.marketId, {
      type: typeLabel,
      label: tm.teamName,
      secondary: "Outright",
    });
  }
  for (const ts of specials) {
    refByMarket.set(ts.marketId, {
      type: ts.type === "top_scorer" ? "Top Scorer" : ts.type === "group_winner" ? "Group Winner" : ts.type,
      label: ts.question,
      secondary: ts.groupLetter ? `Group ${ts.groupLetter}` : "Tournament-wide",
    });
  }
  for (const pred of predictions) {
    refByMarket.set(pred.marketId, {
      type: "Prediction",
      label: pred.question,
      secondary: pred.category,
    });
  }

  return res.json({
    ok: true,
    fires: fires.map((f) => ({
      ...serializeFire(f),
      marketRef: refByMarket.get(f.marketId) ?? { type: "Unknown", label: `Market #${f.marketId}` },
    })),
  });
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
  targetMarketIds: string;
  createdAt: Date;
}) {
  let targetMarketIds: number[] = [];
  try {
    targetMarketIds = JSON.parse(s.targetMarketIds);
  } catch {
    /* ignore */
  }
  return {
    id: s.id,
    englishText: s.englishText,
    parsed: JSON.parse(s.parsedJson),
    status: s.status,
    fireCount: s.fireCount,
    maxLossUsdc: s.maxLossUsdc,
    currentPnlUsdc: s.currentPnlUsdc,
    targetMarketIds,
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
