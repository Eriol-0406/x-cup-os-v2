import { ethers } from "ethers";
import { XCupMarketAbi, MockUSDCAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { getAgentSigner } from "./burner.js";

/**
 * Phase C + D of the agent loop:
 *
 *   C. settle(marketId, winningOutcome) — admin/oracle action, once per market
 *   D. claim(marketId)                  — agent auto-claim for every user with
 *                                          a winning stake
 *
 * One admin call to POST /admin/settle handles both: the deployer signs the
 * settle tx, then we iterate every strategy that fired on this market with
 * the winning outcome and have its agent claim().
 */

export interface SettleResult {
  ok: boolean;
  settleTx?: string;
  reason?: string;
  claims: ClaimResult[];
}

export interface ClaimResult {
  strategyId: string;
  agentAddress: string;
  ok: boolean;
  payoutUsdc?: string;
  txHash?: string;
  reason?: string;
}

/**
 * Resolve a market: settle on-chain with the deployer (oracle role), then
 * iterate winning stakers and trigger auto-claim per their burner agent.
 */
export async function settleAndClaim(
  marketId: number,
  winningOutcomeIdx: number,
): Promise<SettleResult> {
  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);

  if (!env.DEPLOYER_PRIVATE_KEY) {
    return { ok: false, reason: "DEPLOYER_PRIVATE_KEY not configured", claims: [] };
  }
  const oracle = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  const market = new ethers.Contract(deployment.contracts.XCupMarket.address, XCupMarketAbi as any, oracle) as any;

  // 1. Settle (idempotent — second call reverts with AlreadySettled).
  let settleTx: string | undefined;
  try {
    const onchain = await market.getMarket(marketId);
    if (Number(onchain.status) === 1) {
      // Open → settle now
      const tx = await market.settle(marketId, winningOutcomeIdx);
      const receipt = await tx.wait();
      settleTx = receipt.hash;
      // Propagation buffer — same race we hit on stake. Without this, the
      // claim flow downstream queries quoteClaim against an RPC node that
      // hasn't fully indexed the settle tx, gets 0, and bails.
      await new Promise((r) => setTimeout(r, 1500));
    } else if (Number(onchain.status) === 2) {
      // Already Settled — fine, proceed straight to auto-claim
      settleTx = "(already settled)";
    } else {
      return { ok: false, reason: `market status ${Number(onchain.status)} can't be settled`, claims: [] };
    }
  } catch (err: any) {
    return {
      ok: false,
      reason: `settle failed: ${err?.shortMessage ?? err?.message ?? String(err)}`,
      claims: [],
    };
  }

  // 2. Auto-claim. Find every confirmed fire on this market with the winning
  //    outcomeIdx — those are the strategies that won. Deduplicate by
  //    strategyId since a strategy might have fired multiple times.
  const winners = await prisma.strategyFire.findMany({
    where: { marketId, outcomeIdx: winningOutcomeIdx, status: "confirmed" },
    include: { strategy: { include: { user: true } } },
    distinct: ["strategyId"],
  });

  const claims: ClaimResult[] = [];
  for (const f of winners) {
    const strategyId = f.strategyId;
    const user = f.strategy.user;
    if (!user.agentWallet) {
      claims.push({ strategyId, agentAddress: "(none)", ok: false, reason: "no agent wallet" });
      continue;
    }
    claims.push(await claimForStrategy(strategyId, marketId, user.mainWallet, deployment.rpc));
  }

  return { ok: true, settleTx, claims };
}

async function claimForStrategy(
  strategyId: string,
  marketId: number,
  mainWallet: string,
  rpc: string,
): Promise<ClaimResult> {
  const deployment = getDeployment(env.XLAYER_CHAIN_ID);

  // Idempotency: don't double-claim if we already recorded one.
  const existing = await prisma.claim.findUnique({
    where: { strategyId_marketId: { strategyId, marketId } },
  });
  if (existing && existing.status === "confirmed") {
    return {
      strategyId,
      agentAddress: "(cached)",
      ok: true,
      txHash: existing.txHash ?? undefined,
      payoutUsdc: String(existing.payoutUsdc),
      reason: "already claimed",
    };
  }

  const agent = await getAgentSigner(mainWallet, rpc);
  const agentAddress = await agent.getAddress();
  const market = new ethers.Contract(deployment.contracts.XCupMarket.address, XCupMarketAbi as any, agent) as any;
  const usdc = new ethers.Contract(deployment.contracts.MockUSDC.address, MockUSDCAbi as any, agent) as any;

  // Pre-check: does the agent actually have winnings?
  let quote: bigint;
  try {
    quote = await market.quoteClaim(marketId, agentAddress);
  } catch (err: any) {
    return { strategyId, agentAddress, ok: false, reason: err?.shortMessage ?? err?.message ?? String(err) };
  }
  if (quote === 0n) {
    return { strategyId, agentAddress, ok: false, reason: "no winnings to claim" };
  }

  // Insert pending claim row
  const claimRow = await prisma.claim.upsert({
    where: { strategyId_marketId: { strategyId, marketId } },
    create: {
      strategyId,
      marketId,
      payoutUsdc: Number(ethers.formatUnits(quote, 6)),
      status: "pending",
    },
    update: { status: "pending", failureReason: null, payoutUsdc: Number(ethers.formatUnits(quote, 6)) },
  });

  try {
    // Static call first to surface revert reasons cleanly
    await market.claim.staticCall(marketId);

    const tx = await market.claim(marketId);
    const receipt = await tx.wait();
    const payoutUsdc = Number(ethers.formatUnits(quote, 6));

    await prisma.claim.update({
      where: { id: claimRow.id },
      data: { status: "confirmed", txHash: receipt.hash, payoutUsdc },
    });

    // PnL: payout - sum of stakes on this market for this strategy
    const stakesAgg = await prisma.strategyFire.aggregate({
      where: { strategyId, marketId, status: "confirmed" },
      _sum: { stakeUsdc: true },
    });
    const totalStaked = stakesAgg._sum.stakeUsdc ?? 0;
    const pnl = payoutUsdc - totalStaked;
    await prisma.strategy.update({
      where: { id: strategyId },
      data: { currentPnlUsdc: { increment: pnl } },
    });

    return { strategyId, agentAddress, ok: true, txHash: receipt.hash, payoutUsdc: String(payoutUsdc) };
  } catch (err: any) {
    const reason = err?.shortMessage ?? err?.message ?? String(err);
    await prisma.claim.update({
      where: { id: claimRow.id },
      data: { status: "failed", failureReason: reason.slice(0, 500) },
    });
    return { strategyId, agentAddress, ok: false, reason };
  }
}
