"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "./WalletProvider";
import { listPlayerPropsForFixture, type PlayerPropMarketView } from "@/lib/api";
import { mockUsdc, signerProvider, xcupMarket } from "@/lib/contract";

const EXPLORER = "https://www.oklink.com/x-layer-testnet";
const DEFAULT_STAKE = "5";
const WALLET_TIMEOUT_MS = 90_000;

type StakeState =
  | { kind: "idle" }
  | { kind: "running"; outcomeIdx: number }
  | { kind: "done"; outcomeIdx: number; txHash: string }
  | { kind: "error"; message: string };

interface Props {
  fixtureId: number;
  refreshKey: number;
}

export function PlayerPropsPanel({ fixtureId, refreshKey }: Props) {
  const { state: walletState, connect } = useWallet();
  const [markets, setMarkets] = useState<PlayerPropMarketView[]>([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState(DEFAULT_STAKE);
  const [stake, setStake] = useState<StakeState>({ kind: "idle" });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };
  useEffect(() => () => clearTimer(), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const ms = await listPlayerPropsForFixture(fixtureId);
      setMarkets(ms);
    } catch (err) {
      console.warn(`[PlayerPropsPanel] fixture ${fixtureId} load failed`, err);
    } finally {
      setLoading(false);
    }
  }, [fixtureId]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  if (loading && markets.length === 0) {
    return <div className="prop-empty">Loading first-scorer odds…</div>;
  }
  if (!loading && markets.length === 0) return null;

  const onBet = async (m: PlayerPropMarketView, outcomeIdx: number) => {
    if (walletState.kind !== "connected") {
      void connect();
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setStake({ kind: "error", message: "Enter a positive amount" });
      return;
    }
    setStake({ kind: "running", outcomeIdx });
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setStake({ kind: "error", message: "Wallet timeout — popup may be closed" });
    }, WALLET_TIMEOUT_MS);
    try {
      const signer = await signerProvider();
      const usdc = mockUsdc(signer) as any;
      const xcup = xcupMarket(signer) as any;
      const stakeAmount = ethers.parseUnits(String(value), 6);
      const allowance: bigint = await usdc.allowance(walletState.address, await xcup.getAddress());
      if (allowance < stakeAmount) {
        const tx = await usdc.approve(await xcup.getAddress(), ethers.MaxUint256);
        await tx.wait();
      }
      const tx = await xcup.stake(m.marketId, outcomeIdx, stakeAmount);
      await tx.wait();
      clearTimer();
      setStake({ kind: "done", outcomeIdx, txHash: tx.hash });
      refresh();
    } catch (err: any) {
      clearTimer();
      const code = err?.code;
      const userRejected = code === 4001 || /rejected|denied|user closed|user cancel/i.test(err?.message ?? "");
      setStake({
        kind: "error",
        message: userRejected ? "Transaction rejected" : err?.shortMessage ?? err?.message ?? "Bet failed",
      });
    }
  };

  return (
    <div className="prop-panel">
      {markets.map((m) => (
        <div key={m.id} className="prop-market">
          <div className="prop-market-header">
            <span className="prop-market-title">🎯 First goalscorer</span>
            <span className="prop-market-meta">
              {m.totalPotUsdc.toFixed(0)} USDC pool · M#{m.marketId} {m.settled && "· Settled"}
            </span>
          </div>
          <div className="prop-outcomes">
            {m.outcomes.map((o) => {
              const isBusy = stake.kind === "running" && stake.outcomeIdx === o.idx;
              const lastDone = stake.kind === "done" && stake.outcomeIdx === o.idx;
              return (
                <div key={o.idx} className={`prop-outcome${o.isWinner ? " prop-outcome-winner" : ""}`}>
                  <div className="prop-outcome-info">
                    <span className="prop-outcome-label">{o.label}</span>
                    {o.teamName && <span className="prop-outcome-team">({o.teamName})</span>}
                  </div>
                  <div className="prop-outcome-prob">{(o.impliedProb * 100).toFixed(0)}%</div>
                  <div className="prop-outcome-pot">{o.potUsdc.toFixed(0)} USDC</div>
                  {!m.settled && (
                    <button
                      className="prop-bet-btn"
                      onClick={() => onBet(m, o.idx)}
                      disabled={isBusy || stake.kind === "running"}
                      title={`Bet ${amount} USDC that ${o.label} scores first`}
                    >
                      {isBusy ? "…" : lastDone ? "✓" : "Bet"}
                    </button>
                  )}
                  {o.isWinner && <span className="prop-outcome-trophy">🏆</span>}
                </div>
              );
            })}
          </div>
          {!m.settled && (
            <div className="prop-amount-row">
              <span className="prop-amount-label">stake</span>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="prop-amount-input"
              />
              <span className="prop-amount-label">USDC</span>
              {stake.kind === "done" && (
                <a className="prop-tx-link" href={`${EXPLORER}/tx/${stake.txHash}`} target="_blank" rel="noreferrer">
                  ✓ tx ↗
                </a>
              )}
              {stake.kind === "error" && (
                <span className="prop-error">
                  ✗ {stake.message}
                  <button className="tourney-cancel" onClick={() => setStake({ kind: "idle" })}>
                    dismiss
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
