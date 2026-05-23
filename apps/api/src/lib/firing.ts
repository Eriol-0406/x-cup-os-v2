import { ethers } from "ethers";
import { XCupMarketAbi, MockUSDCAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { ParsedStrategy } from "@x-cup/types";
import { env } from "../env.js";
import { getAgentSigner } from "./burner.js";
import { triggerMatches, actionOutcomeIdx, type MatchEvent } from "./evaluator.js";

/**
 * Fire a single strategy: approve USDC (if needed), then stake().
 * Persists a StrategyFire row and updates the strategy's fireCount.
 */
export interface FireResult {
  fireId: string;
  ok: boolean;
  txHash?: string;
  reason?: string;
}

export async function fireStrategy(
  strategyId: string,
  ev: MatchEvent,
): Promise<FireResult> {
  const strategy = await prisma.strategy.findUnique({
    where: { id: strategyId },
    include: { user: true },
  });
  if (!strategy) {
    throw new Error(`Strategy ${strategyId} not found`);
  }
  const parsed = JSON.parse(strategy.parsedJson) as ParsedStrategy;

  // Pre-flight checks (re-validate at fire time per spec section 5, phase B step 4)
  const checks = await preflightChecks(strategy, parsed, ev);
  if (!checks.ok) {
    const fire = await prisma.strategyFire.create({
      data: {
        strategyId,
        marketId: ev.marketId,
        outcomeIdx: actionOutcomeIdx(parsed),
        stakeUsdc: parsed.action.stakeUsdc,
        status: "failed",
        failureReason: checks.reason,
        matchEventJson: JSON.stringify(ev),
      },
    });
    return { fireId: fire.id, ok: false, reason: checks.reason };
  }

  // Build the signer, contracts, and amounts.
  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const signer = await getAgentSigner(strategy.user.mainWallet, deployment.rpc);
  // Cast to `any` — ethers v6 Contract methods aren't statically typed against the ABI here.
  const market = new ethers.Contract(deployment.contracts.XCupMarket.address, XCupMarketAbi as any, signer) as any;
  const usdc = new ethers.Contract(deployment.contracts.MockUSDC.address, MockUSDCAbi as any, signer) as any;
  const stakeAmount = ethers.parseUnits(String(parsed.action.stakeUsdc), 6);

  // Record pending fire row up-front so failures during tx submission are visible.
  const fire = await prisma.strategyFire.create({
    data: {
      strategyId,
      marketId: ev.marketId,
      outcomeIdx: actionOutcomeIdx(parsed),
      stakeUsdc: parsed.action.stakeUsdc,
      status: "pending",
      matchEventJson: JSON.stringify(ev),
    },
  });

  try {
    // Approve XCupMarket to spend if allowance < stake (one-time per agent + spender pair).
    const allowance: bigint = await usdc.allowance(await signer.getAddress(), deployment.contracts.XCupMarket.address);
    if (allowance < stakeAmount) {
      const approveTx = await usdc.approve(deployment.contracts.XCupMarket.address, ethers.MaxUint256);
      await approveTx.wait();
      // Race-condition guard: even after wait(), some RPC nodes briefly serve
      // pre-tx state for subsequent calls. Sleep a beat + simulate the stake
      // before broadcasting so we get a useful error instead of a silent revert.
      await new Promise((r) => setTimeout(r, 800));
    }

    // Pre-flight static call to surface revert reasons cleanly.
    try {
      await market.stake.staticCall(ev.marketId, actionOutcomeIdx(parsed), stakeAmount);
    } catch (simErr: any) {
      throw new Error(`stake simulation reverted: ${simErr?.shortMessage ?? simErr?.message ?? simErr}`);
    }

    // Stake.
    const tx = await market.stake(ev.marketId, actionOutcomeIdx(parsed), stakeAmount);
    const receipt = await tx.wait();

    await prisma.strategyFire.update({
      where: { id: fire.id },
      data: { txHash: receipt.hash, status: "confirmed" },
    });
    await prisma.strategy.update({
      where: { id: strategyId },
      data: { fireCount: { increment: 1 } },
    });
    return { fireId: fire.id, ok: true, txHash: receipt.hash };
  } catch (err: any) {
    await prisma.strategyFire.update({
      where: { id: fire.id },
      data: {
        status: "failed",
        failureReason: (err?.shortMessage ?? err?.message ?? String(err)).slice(0, 500),
      },
    });
    return { fireId: fire.id, ok: false, reason: err?.shortMessage ?? err?.message ?? String(err) };
  }
}

/** Pre-flight: re-check bankroll, risk limits, market status. */
async function preflightChecks(
  strategy: { fireCount: number; maxLossUsdc: number | null; currentPnlUsdc: number; user: { mainWallet: string } },
  parsed: ParsedStrategy,
  ev: MatchEvent,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // 1. Risk: maxFires
  if (parsed.riskLimits.maxFires && strategy.fireCount >= parsed.riskLimits.maxFires) {
    return { ok: false, reason: `maxFires (${parsed.riskLimits.maxFires}) already hit` };
  }

  // 2. Risk: maxLossUsdc — if current PnL is already past stop-loss, don't fire.
  const limit = strategy.maxLossUsdc ?? parsed.riskLimits.maxLossUsdc ?? null;
  if (limit !== null && -strategy.currentPnlUsdc >= limit) {
    return { ok: false, reason: `stop-loss (${limit} USDC) already exceeded` };
  }

  // 3. Risk: expiresAt
  if (parsed.riskLimits.expiresAt) {
    const exp = new Date(parsed.riskLimits.expiresAt).getTime();
    if (Date.now() > exp) return { ok: false, reason: "strategy expired" };
  }

  // 4. On-chain: market still open?
  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const market = new ethers.Contract(deployment.contracts.XCupMarket.address, XCupMarketAbi as any, provider) as any;
  const m = await market.getMarket(ev.marketId);
  if (Number(m.status) !== 1) return { ok: false, reason: `market not Open (status ${Number(m.status)})` };
  if (Number(m.closeTime) * 1000 <= Date.now()) return { ok: false, reason: "market past closeTime" };

  // 5. Bankroll: agent has enough USDC?
  const usdc = new ethers.Contract(deployment.contracts.MockUSDC.address, MockUSDCAbi as any, provider) as any;
  const user = await prisma.user.findUnique({ where: { mainWallet: strategy.user.mainWallet } });
  if (!user?.agentWallet) return { ok: false, reason: "no agent wallet provisioned" };
  const bal: bigint = await usdc.balanceOf(user.agentWallet);
  const need = ethers.parseUnits(String(parsed.action.stakeUsdc), 6);
  if (bal < need) {
    return {
      ok: false,
      reason: `agent USDC balance ${ethers.formatUnits(bal, 6)} < required ${ethers.formatUnits(need, 6)}`,
    };
  }

  // (We don't check OKB here — the tx will revert naturally if gas is insufficient.)
  return { ok: true };
}

/**
 * Find every active strategy whose trigger matches the given event, then fire them.
 * Used by the admin endpoint to simulate match outcomes during the demo.
 */
export async function processMatchEvent(ev: MatchEvent): Promise<FireResult[]> {
  const actives = await prisma.strategy.findMany({
    where: { status: "active" },
    include: { user: true },
  });

  const fires: FireResult[] = [];
  for (const s of actives) {
    const parsed = JSON.parse(s.parsedJson) as ParsedStrategy;
    if (!triggerMatches(parsed, ev)) continue;
    try {
      const r = await fireStrategy(s.id, ev);
      fires.push(r);
    } catch (err: any) {
      fires.push({ fireId: "(none)", ok: false, reason: err?.message ?? String(err) });
    }
  }
  return fires;
}
