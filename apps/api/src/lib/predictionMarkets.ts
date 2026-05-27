import { ethers } from "ethers";
import { XCupMarketAbi, getDeployment } from "@x-cup/abi";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { MarketFees } from "./marketFees.js";

/**
 * Pillar-2 prediction markets — binary YES/NO opinion bets that don't tie to
 * a single fixture. "Will an unbeaten champion emerge?", "Top scorer 5+ goals?"
 * etc. Each becomes a standard XCupMarket with outcomeCount=2.
 *
 * matchId on-chain: "WC{season}-PRED-{slug}" (slug uniqueness enforced in DB).
 *
 * Settled by admin oracle via the existing /admin/settle endpoint once the
 * tournament resolves the question (winning_outcome 0 = YES, 1 = NO).
 */

export interface CreatePredictionInput {
  slug: string;
  question: string;
  category?: "Tournament" | "Player" | "Special";
  isPrivate?: boolean;
  allowlist?: string[];
}

export interface CreatedPredictionMarket {
  slug: string;
  question: string;
  marketId: number;
  txHash: string;
  isPrivate: boolean;
}

export async function createPredictionMarket(input: CreatePredictionInput): Promise<CreatedPredictionMarket> {
  if (!env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  // Idempotency: bail if a market for this slug already exists.
  const existing = await prisma.predictionMarket.findUnique({
    where: { slug: input.slug },
  });
  if (existing) {
    return {
      slug: existing.slug,
      question: existing.question,
      marketId: existing.marketId,
      txHash: existing.createMarketTx,
      isPrivate: existing.isPrivate,
    };
  }

  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const admin = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  const market = new ethers.Contract(
    deployment.contracts.XCupMarket.address,
    XCupMarketAbi as any,
    admin,
  ) as any;

  const matchId = `WC${env.WC_SEASON}-PRED-${input.slug}`;
  const closeTime = Math.floor(Date.now() / 1000) + 30 * 24 * 3600; // 30-day betting window

  const tx = await market.createMarket(matchId, 2, closeTime, MarketFees.PREDICTION_OPINION);
  const receipt = await tx.wait();

  const log = receipt.logs.find((l: any) => {
    try {
      const parsed = market.interface.parseLog(l);
      return parsed?.name === "MarketCreated";
    } catch {
      return false;
    }
  });
  if (!log) throw new Error("MarketCreated event missing in receipt");
  const parsed = market.interface.parseLog(log);
  const marketId = Number(parsed!.args.marketId);

  await prisma.predictionMarket.create({
    data: {
      slug: input.slug,
      question: input.question,
      category: input.category ?? "Tournament",
      season: env.WC_SEASON,
      marketId,
      createMarketTx: receipt.hash,
      isPrivate: input.isPrivate ?? false,
      allowlistJson: JSON.stringify(input.allowlist ?? []),
    },
  });

  return {
    slug: input.slug,
    question: input.question,
    marketId,
    txHash: receipt.hash,
    isPrivate: input.isPrivate ?? false,
  };
}

/** Default seed for WC 2022 — five canonical opinion questions. */
export const DEFAULT_PREDICTION_SEEDS: CreatePredictionInput[] = [
  {
    slug: "unbeaten-champion-2022",
    question: "Will an unbeaten champion emerge from WC 2022?",
    category: "Tournament",
  },
  {
    slug: "top-scorer-5plus-2022",
    question: "Will the WC 2022 Golden Boot winner score 5 or more goals?",
    category: "Player",
  },
  {
    slug: "host-reaches-r16-2022",
    question: "Will the host nation (Qatar) reach the Round of 16?",
    category: "Tournament",
  },
  {
    slug: "european-golden-boot-2022",
    question: "Will the WC 2022 Golden Boot winner be from a European nation?",
    category: "Player",
  },
  {
    slug: "underdog-semifinal-2022",
    question: "Will a non-top-10 FIFA-ranked team reach the semi-finals?",
    category: "Special",
  },
];

export async function seedDefaultPredictions(): Promise<CreatedPredictionMarket[]> {
  const results: CreatedPredictionMarket[] = [];
  for (const seed of DEFAULT_PREDICTION_SEEDS) {
    try {
      results.push(await createPredictionMarket(seed));
    } catch (err: any) {
      console.error(`[seedDefaultPredictions] ${seed.slug} failed:`, err?.shortMessage ?? err?.message ?? err);
    }
  }
  return results;
}

/** Settle a prediction market (admin/oracle action). */
export async function settlePredictionMarket(
  slug: string,
  winningOutcome: number,
): Promise<{ ok: boolean; txHash?: string; reason?: string }> {
  if (!env.DEPLOYER_PRIVATE_KEY) return { ok: false, reason: "no deployer key" };
  const row = await prisma.predictionMarket.findUnique({ where: { slug } });
  if (!row) return { ok: false, reason: `no prediction market with slug=${slug}` };
  if (row.settled) return { ok: false, reason: "already settled" };

  const deployment = getDeployment(env.XLAYER_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(deployment.rpc);
  const oracle = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  const market = new ethers.Contract(
    deployment.contracts.XCupMarket.address,
    XCupMarketAbi as any,
    oracle,
  ) as any;

  try {
    const tx = await market.settle(row.marketId, winningOutcome);
    const receipt = await tx.wait();
    await prisma.predictionMarket.update({
      where: { id: row.id },
      data: { settled: true, winningOutcome },
    });
    return { ok: true, txHash: receipt.hash };
  } catch (err: any) {
    return { ok: false, reason: err?.shortMessage ?? err?.message ?? String(err) };
  }
}
