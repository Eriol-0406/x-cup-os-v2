"use client";

import { ethers } from "ethers";
import { XCupMarketAbi, MockUSDCAbi, getDeployment } from "@x-cup/abi";
import { XLAYER_TESTNET_CHAIN_ID, getProvider } from "./wallet";

/**
 * Read-only provider for X Layer testnet. Used for contract reads (match list,
 * pot sizes) — we don't need the user's wallet for those, so we don't bother
 * waiting for connect.
 */
export function readProvider() {
  const d = getDeployment(XLAYER_TESTNET_CHAIN_ID);
  return new ethers.JsonRpcProvider(d.rpc);
}

/**
 * Signing provider — wraps the user's connected EIP-1193 wallet.
 * Throws if no wallet is connected.
 */
export async function signerProvider(): Promise<ethers.Signer> {
  const eip1193 = getProvider();
  if (!eip1193) throw new Error("No wallet provider available");
  const browser = new ethers.BrowserProvider(eip1193 as unknown as ethers.Eip1193Provider);
  return browser.getSigner();
}

/* ---- Contracts ---- */

export function xcupMarket(runner: ethers.ContractRunner) {
  const d = getDeployment(XLAYER_TESTNET_CHAIN_ID);
  return new ethers.Contract(d.contracts.XCupMarket.address, XCupMarketAbi as any, runner);
}

export function mockUsdc(runner: ethers.ContractRunner) {
  const d = getDeployment(XLAYER_TESTNET_CHAIN_ID);
  return new ethers.Contract(d.contracts.MockUSDC.address, MockUSDCAbi as any, runner);
}

/* ---- High-level market read ---- */

export type MarketStatus = "None" | "Open" | "Settled" | "Cancelled";

export interface MarketView {
  id: number;
  matchId: string;
  outcomeCount: number;
  status: MarketStatus;
  closeTime: number; // unix seconds
  winningOutcome: number;
  totalPot: bigint;
  outcomePots: bigint[];
}

const STATUS_NAMES: MarketStatus[] = ["None", "Open", "Settled", "Cancelled"];

export async function fetchAllMarkets(): Promise<MarketView[]> {
  const p = readProvider();
  const market = xcupMarket(p);
  const nextId = Number(await market.nextMarketId());
  const ids = Array.from({ length: nextId }, (_, i) => i + 1);

  return Promise.all(
    ids.map(async (id) => {
      const m = await market.getMarket(id);
      const outcomeCount = Number(m.outcomeCount);
      const pots = await Promise.all(
        Array.from({ length: outcomeCount }, (_, idx) => market.getOutcomePot(id, idx)),
      );
      return {
        id,
        matchId: m.matchId as string,
        outcomeCount,
        status: STATUS_NAMES[Number(m.status)] ?? "None",
        closeTime: Number(m.closeTime),
        winningOutcome: Number(m.winningOutcome),
        totalPot: m.totalPot as bigint,
        outcomePots: pots as bigint[],
      };
    }),
  );
}

/* ---- Display helpers ---- */

const FLAG: Record<string, string> = {
  ARG: "🇦🇷",
  FRA: "🇫🇷",
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  BRA: "🇧🇷",
  GER: "🇩🇪",
  ESP: "🇪🇸",
  POR: "🇵🇹",
  ITA: "🇮🇹",
  NED: "🇳🇱",
  CRO: "🇭🇷",
  MAR: "🇲🇦",
  JPN: "🇯🇵",
  KOR: "🇰🇷",
  MEX: "🇲🇽",
  USA: "🇺🇸",
};

/** Best-effort: "FIFA-ARG-FRA-2026" → { home: "ARG", away: "FRA", year: "2026" } */
export function parseMatchId(matchId: string): { home?: string; away?: string; label: string } {
  const m = matchId.match(/^FIFA-([A-Z]{3})-([A-Z]{3})-(\d{4})$/);
  if (!m) return { label: matchId };
  return { home: m[1], away: m[2], label: matchId };
}

export function flagFor(code?: string): string {
  if (!code) return "⚽";
  return FLAG[code] ?? "⚽";
}

export function formatUsdcPot(wei: bigint): string {
  // USDC is 6 decimals
  const n = Number(wei) / 1e6;
  if (n === 0) return "0";
  if (n < 1) return n.toFixed(2);
  if (n < 1000) return n.toFixed(0);
  return `${(n / 1000).toFixed(1)}k`;
}

export function formatCloseIn(closeUnix: number): string {
  const ms = closeUnix * 1000 - Date.now();
  if (ms < 0) return "closed";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
