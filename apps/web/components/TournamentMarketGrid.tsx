"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { listTournamentMarkets, type TournamentMarketRecord, type ArbWinnerVsRfSignal } from "@/lib/api";
import { mockUsdc, signerProvider, xcupMarket } from "@/lib/contract";
import { useWallet } from "./WalletProvider";
import { ArbChip } from "./OutrightsHub";

const EXPLORER = "https://www.oklink.com/x-layer-testnet";
const DEFAULT_STAKE = "10";
const WALLET_TIMEOUT_MS = 90_000; // auto-fail if no wallet response in 90s

type Sort = "alpha" | "pot" | "yesProb";

type State =
  | { kind: "loading" }
  | { kind: "ready"; markets: TournamentMarketRecord[]; at: number }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function TournamentMarketGrid({ arbViolations }: { arbViolations?: Map<number, ArbWinnerVsRfSignal> } = {}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [sort, setSort] = useState<Sort>("pot");

  const refresh = useCallback(async () => {
    try {
      const markets = await listTournamentMarkets();
      if (markets.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      setState({ kind: "ready", markets, at: Date.now() });
    } catch (err: any) {
      setState({ kind: "error", message: err?.message ?? "Failed to load tournament markets" });
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20_000); // refresh every 20s
    const onStake = () => refresh();
    window.addEventListener("xcup:tournament-stake", onStake);
    return () => {
      window.removeEventListener("xcup:tournament-stake", onStake);
      clearInterval(t);
    };
  }, [refresh]);

  const sorted = useMemo(() => {
    if (state.kind !== "ready") return [];
    const arr = [...state.markets];
    arr.sort((a, b) => {
      if (sort === "alpha") return a.teamName.localeCompare(b.teamName);
      if (sort === "yesProb") return b.impliedYesProb - a.impliedYesProb;
      return b.totalPotUsdc - a.totalPotUsdc;
    });
    return arr;
  }, [state, sort]);

  return (
    <section id="tournament" style={{ marginBottom: 64 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Tournament Winner</h2>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
            Long-term bets — "Does this team win the cup?" One binary market per team.
          </div>
        </div>
        <div className="filter-pills">
          <button className={`filter-pill${sort === "pot" ? " filter-pill-active" : ""}`} onClick={() => setSort("pot")}>
            <span>By pot</span>
          </button>
          <button className={`filter-pill${sort === "yesProb" ? " filter-pill-active" : ""}`} onClick={() => setSort("yesProb")}>
            <span>By odds</span>
          </button>
          <button className={`filter-pill${sort === "alpha" ? " filter-pill-active" : ""}`} onClick={() => setSort("alpha")}>
            <span>A → Z</span>
          </button>
        </div>
      </div>

      {state.kind === "loading" && (
        <div className="loading-card">
          <span className="spinner" /> Loading tournament markets…
        </div>
      )}
      {state.kind === "error" && (
        <div className="error-card">
          <strong>Couldn't load tournament markets</strong> — {state.message}
        </div>
      )}
      {state.kind === "empty" && (
        <div className="preview-empty">
          No tournament markets yet. Run <code>POST /admin/create-tournament-markets</code>.
        </div>
      )}
      {state.kind === "ready" && (
        <div className="tourney-grid">
          {sorted.map((m) => (
            <TeamCard key={m.teamId} m={m} onAfterStake={refresh} arbSignal={arbViolations?.get(m.teamId)} />
          ))}
        </div>
      )}
    </section>
  );
}

type StakeState =
  | { kind: "idle" }
  | { kind: "approving" }
  | { kind: "sending"; txHash?: string }
  | { kind: "done"; txHash: string }
  | { kind: "error"; message: string };

function TeamCard({
  m,
  onAfterStake,
  arbSignal,
}: {
  m: TournamentMarketRecord;
  onAfterStake: () => void;
  arbSignal?: ArbWinnerVsRfSignal;
}) {
  const { state: walletState, connect } = useWallet();
  const [amount, setAmount] = useState(DEFAULT_STAKE);
  const [stake, setStake] = useState<StakeState>({ kind: "idle" });
  const [claim, setClaim] = useState<StakeState>({ kind: "idle" });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const probPercent = (m.impliedYesProb * 100).toFixed(0);
  const isWinner = m.settled && m.winningOutcome === 0;
  const isLoser = m.settled && m.winningOutcome === 1;

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => () => clearTimer(), []);

  const cancelPending = () => {
    clearTimer();
    setStake({ kind: "idle" });
  };

  const onStake = async (outcomeIdx: 0 | 1) => {
    if (walletState.kind !== "connected") {
      void connect();
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setStake({ kind: "error", message: "Enter a positive amount" });
      return;
    }
    setStake({ kind: "approving" });
    // Safety net — if the wallet popup hangs (user closed it without rejecting,
    // some wallets just never resolve the promise) we auto-fail after 90s so
    // the UI doesn't sit forever on "Approving USDC…".
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setStake({
        kind: "error",
        message: "Timed out — wallet popup closed or no response. Click YES/NO again to retry.",
      });
    }, WALLET_TIMEOUT_MS);
    try {
      const signer = await signerProvider();
      const usdc = mockUsdc(signer) as any;
      const xcup = xcupMarket(signer) as any;
      const stakeAmount = ethers.parseUnits(String(value), 6);

      // Check + approve if needed
      const allowance: bigint = await usdc.allowance(walletState.address, await xcup.getAddress());
      if (allowance < stakeAmount) {
        const tx = await usdc.approve(await xcup.getAddress(), ethers.MaxUint256);
        await tx.wait();
      }

      setStake({ kind: "sending" });
      const tx = await xcup.stake(m.marketId, outcomeIdx, stakeAmount);
      setStake({ kind: "sending", txHash: tx.hash });
      await tx.wait();
      clearTimer();
      setStake({ kind: "done", txHash: tx.hash });
      window.dispatchEvent(new CustomEvent("xcup:tournament-stake", { detail: { marketId: m.marketId } }));
      onAfterStake();
    } catch (err: any) {
      clearTimer();
      const code = err?.code;
      const userRejected = code === 4001 || /rejected|denied|user closed|user cancel/i.test(err?.message ?? "");
      setStake({
        kind: "error",
        message: userRejected ? "Transaction rejected" : err?.shortMessage ?? err?.message ?? "Stake failed",
      });
    }
  };

  const busy = stake.kind === "approving" || stake.kind === "sending";

  const onClaim = async () => {
    if (walletState.kind !== "connected") {
      void connect();
      return;
    }
    setClaim({ kind: "sending" });
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setClaim({ kind: "error", message: "Timed out — wallet popup closed or no response." });
    }, WALLET_TIMEOUT_MS);
    try {
      const signer = await signerProvider();
      const xcup = xcupMarket(signer) as any;
      const tx = await xcup.claim(m.marketId);
      setClaim({ kind: "sending", txHash: tx.hash });
      await tx.wait();
      clearTimer();
      setClaim({ kind: "done", txHash: tx.hash });
      onAfterStake();
    } catch (err: any) {
      clearTimer();
      const code = err?.code;
      const userRejected = code === 4001 || /rejected|denied|user closed|user cancel/i.test(err?.message ?? "");
      setClaim({
        kind: "error",
        message: userRejected ? "Claim rejected" : err?.shortMessage ?? err?.message ?? "Claim failed",
      });
    }
  };

  return (
    <div className={`tourney-card${isWinner ? " tourney-card-winner" : ""}${isLoser ? " tourney-card-loser" : ""}`}>
      <div className="tourney-head">
        <Image src={m.teamLogo} alt={m.teamName} width={36} height={36} unoptimized className="team-logo" />
        <div className="tourney-team">
          <div className="tourney-team-name">{m.teamName}</div>
          <div className="tourney-team-code">{m.teamCode ?? ""}</div>
        </div>
        {m.settled && (
          <span className={`tag ${isWinner ? "tag-yes" : "tag-no"}`} style={{ fontSize: 9 }}>
            {isWinner ? "CHAMP" : "OUT"}
          </span>
        )}
      </div>

      <div className="tourney-odds">
        <div className="tourney-bar-wrap">
          {m.totalPotUsdc === 0 ? (
            // Empty pool — neutral gray, no implied probability to read into
            <span style={{ width: "100%", background: "var(--border)", opacity: 0.5, display: "block", height: "100%" }} />
          ) : (
            <span className="tourney-bar" style={{ width: `${m.impliedYesProb * 100}%` }} />
          )}
        </div>
        <div className="tourney-prob-row">
          {m.totalPotUsdc === 0 ? (
            <>
              <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>no bets yet</span>
              <span style={{ color: "var(--text-3)" }}>0 USDC pool</span>
            </>
          ) : (
            <>
              <span style={{ color: "var(--success)" }}>YES {probPercent}%</span>
              <span style={{ color: "var(--text-3)" }}>{m.totalPotUsdc.toFixed(0)} USDC pool</span>
            </>
          )}
        </div>
        {typeof m.feeBps === "number" && m.feeBps > 0 && (
          <div
            className="tourney-fee-tag"
            title={`Protocol fee deducted from each winning claim on this market (${(m.feeBps / 100).toFixed(2)}%)`}
            style={{
              fontSize: 10,
              color: "var(--text-3)",
              marginTop: 4,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            {(m.feeBps / 100).toFixed(2)}% fee
          </div>
        )}
        {arbSignal && <ArbChip signal={arbSignal} side="winner" />}
      </div>

      {!m.settled && (
        <div className="tourney-bet-row">
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="tourney-input"
            disabled={busy}
          />
          <button
            className="tourney-bet-btn tourney-bet-yes"
            onClick={() => onStake(0)}
            disabled={busy}
            title={`Bet ${amount} USDC that ${m.teamName} wins the World Cup`}
          >
            YES
          </button>
          <button
            className="tourney-bet-btn tourney-bet-no"
            onClick={() => onStake(1)}
            disabled={busy}
            title={`Bet ${amount} USDC that ${m.teamName} does NOT win the World Cup`}
          >
            NO
          </button>
        </div>
      )}

      {m.settled && claim.kind !== "done" && (
        <div className="tourney-bet-row" style={{ gridTemplateColumns: "1fr" }}>
          <button
            className={`tourney-bet-btn ${isWinner ? "tourney-bet-yes" : "tourney-bet-no"}`}
            onClick={onClaim}
            disabled={claim.kind === "sending"}
            title={`Pull your share of the ${isWinner ? "YES" : "NO"} pot for ${m.teamName}`}
          >
            {claim.kind === "sending" ? "Claiming…" : "Claim winnings"}
          </button>
        </div>
      )}

      {claim.kind !== "idle" && (
        <div className="tourney-status">
          {claim.kind === "sending" && (
            <>
              <span className="spinner" /> Claiming…
              <button className="tourney-cancel" onClick={() => { clearTimer(); setClaim({ kind: "idle" }); }}>
                cancel
              </button>
            </>
          )}
          {claim.kind === "done" && (
            <span style={{ color: "var(--success)" }}>
              ✓ Claimed · <a href={`${EXPLORER}/tx/${claim.txHash}`} target="_blank" rel="noreferrer">tx</a>
            </span>
          )}
          {claim.kind === "error" && (
            <>
              <span style={{ color: "var(--error)", flex: 1 }}>✗ {claim.message}</span>
              <button className="tourney-cancel" onClick={() => setClaim({ kind: "idle" })}>
                dismiss
              </button>
            </>
          )}
        </div>
      )}

      {stake.kind !== "idle" && (
        <div className="tourney-status">
          {stake.kind === "approving" && (
            <>
              <span className="spinner" /> Approving USDC…
              <button className="tourney-cancel" onClick={cancelPending} title="Reset if your wallet popup closed without confirming">
                cancel
              </button>
            </>
          )}
          {stake.kind === "sending" && (
            <>
              <span className="spinner" /> Confirming stake…
              <button className="tourney-cancel" onClick={cancelPending} title="Reset — tx may still go through if already broadcast">
                cancel
              </button>
            </>
          )}
          {stake.kind === "done" && (
            <span style={{ color: "var(--success)" }}>
              ✓ Staked · <a href={`${EXPLORER}/tx/${stake.txHash}`} target="_blank" rel="noreferrer">tx</a>
            </span>
          )}
          {stake.kind === "error" && (
            <>
              <span style={{ color: "var(--error)", flex: 1 }}>✗ {stake.message}</span>
              <button className="tourney-cancel" onClick={cancelPending}>
                dismiss
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
