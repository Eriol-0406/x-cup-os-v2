"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { listPredictionMarkets, type PredictionMarketView } from "@/lib/api";
import { mockUsdc, signerProvider, xcupMarket } from "@/lib/contract";
import { useWallet } from "./WalletProvider";
import { CreatePredictionForm } from "./CreatePredictionForm";

const EXPLORER = "https://www.oklink.com/x-layer-testnet";
const DEFAULT_STAKE = "10";
const WALLET_TIMEOUT_MS = 90_000;

type Filter = "all" | "Tournament" | "Player" | "Special";
type State =
  | { kind: "loading" }
  | { kind: "ready"; markets: PredictionMarketView[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function PredictionMarketGrid() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = useCallback(async () => {
    try {
      const ms = await listPredictionMarkets();
      if (ms.length === 0) setState({ kind: "empty" });
      else setState({ kind: "ready", markets: ms });
    } catch (err: any) {
      setState({ kind: "error", message: err?.message ?? "Failed to load predictions" });
    }
  }, []);

  useEffect(() => {
    refresh();
    const onStake = () => refresh();
    window.addEventListener("xcup:prediction-stake", onStake);
    const t = setInterval(refresh, 20_000);
    return () => {
      window.removeEventListener("xcup:prediction-stake", onStake);
      clearInterval(t);
    };
  }, [refresh]);

  const filtered =
    state.kind === "ready"
      ? filter === "all"
        ? state.markets
        : state.markets.filter((m) => m.category === filter)
      : [];

  const counts: Record<Filter, number> =
    state.kind === "ready"
      ? {
          all: state.markets.length,
          Tournament: state.markets.filter((m) => m.category === "Tournament").length,
          Player: state.markets.filter((m) => m.category === "Player").length,
          Special: state.markets.filter((m) => m.category === "Special").length,
        }
      : { all: 0, Tournament: 0, Player: 0, Special: 0 };

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Predictions</h2>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
            Yes/No opinion markets — "Will an unbeaten champion emerge?", "Top scorer 5+ goals?"
          </div>
        </div>
      </div>

      <CreatePredictionForm onCreated={refresh} />

      {state.kind === "ready" && (
        <div className="filter-pills">
          {(["all", "Tournament", "Player", "Special"] as Filter[]).map((f) => (
            <button
              key={f}
              className={`filter-pill${filter === f ? " filter-pill-active" : ""}`}
              onClick={() => setFilter(f)}
            >
              <span>{f === "all" ? "All" : f}</span>
              <span className="filter-pill-count">{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      {state.kind === "loading" && <div className="loading-card"><span className="spinner" /> Loading…</div>}
      {state.kind === "empty" && (
        <div className="preview-empty">
          No prediction markets yet. Run <code>POST /admin/seed-predictions</code>.
        </div>
      )}
      {state.kind === "error" && <div className="error-card">✗ {state.message}</div>}
      {state.kind === "ready" && (
        <div className="prediction-grid">
          {filtered.map((m) => (
            <PredictionCard key={m.id} m={m} onAfterStake={refresh} />
          ))}
        </div>
      )}
    </section>
  );
}

type StakeState =
  | { kind: "idle" }
  | { kind: "running"; outcome: 0 | 1 }
  | { kind: "done"; txHash: string }
  | { kind: "error"; message: string };

function PredictionCard({ m, onAfterStake }: { m: PredictionMarketView; onAfterStake: () => void }) {
  const { state: walletState, connect } = useWallet();
  const [amount, setAmount] = useState(DEFAULT_STAKE);
  const [stake, setStake] = useState<StakeState>({ kind: "idle" });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };
  useEffect(() => () => clearTimer(), []);

  // When the pool is empty (no one has bet yet), the implied probability is
  // 0 by default — which would render the bar as 100% red and "0% YES / 100%
  // NO". That's misleading: nobody has taken a side. Detect this and show a
  // neutral state instead.
  const noBetsYet = m.totalPotUsdc === 0;
  const yesPct = (m.yesProb * 100).toFixed(0);
  const noPct = (100 - Number(yesPct)).toFixed(0);
  const isWinner = (outcome: 0 | 1) => m.settled && m.winningOutcome === outcome;

  const userIsAllowed =
    !m.isPrivate ||
    m.allowlist.length === 0 ||
    (walletState.kind === "connected" &&
      m.allowlist.map((a) => a.toLowerCase()).includes(walletState.address.toLowerCase()));

  const onBet = async (outcome: 0 | 1) => {
    if (walletState.kind !== "connected") {
      void connect();
      return;
    }
    if (!userIsAllowed) {
      setStake({ kind: "error", message: "Your wallet is not in the allowlist for this private market" });
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setStake({ kind: "error", message: "Enter a positive amount" });
      return;
    }
    setStake({ kind: "running", outcome });
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setStake({ kind: "error", message: "Wallet timeout" });
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
      const tx = await xcup.stake(m.marketId, outcome, stakeAmount);
      await tx.wait();
      clearTimer();
      setStake({ kind: "done", txHash: tx.hash });
      window.dispatchEvent(new CustomEvent("xcup:prediction-stake", { detail: { slug: m.slug } }));
      onAfterStake();
    } catch (err: any) {
      clearTimer();
      const userRejected = err?.code === 4001 || /rejected|denied|user closed|user cancel/i.test(err?.message ?? "");
      setStake({
        kind: "error",
        message: userRejected ? "Transaction rejected" : err?.shortMessage ?? err?.message ?? "Bet failed",
      });
    }
  };

  const busy = stake.kind === "running";

  return (
    <div className={`prediction-card${m.settled ? " prediction-card-settled" : ""}`}>
      <div className="prediction-card-header">
        <span className={`category-pill category-${m.category.toLowerCase()}`}>{m.category}</span>
        {m.isPrivate && <span className="prediction-private-badge">🔒 Private</span>}
        {m.settled && (
          <span className="status-pill status-settled">
            Settled · {m.winningOutcome === 0 ? "YES" : "NO"}
          </span>
        )}
      </div>
      <div className="prediction-question">{m.question}</div>

      <div className="prediction-bar-wrap">
        {noBetsYet ? (
          // Neutral gray fill spanning the full bar — no side has any stake yet
          <span
            style={{
              width: "100%",
              background: "var(--border)",
              opacity: 0.6,
              display: "block",
              height: "100%",
            }}
          />
        ) : (
          <>
            <span className={`prediction-bar-yes${isWinner(0) ? " prediction-bar-winner" : ""}`} style={{ width: `${m.yesProb * 100}%` }} />
            <span className={`prediction-bar-no${isWinner(1) ? " prediction-bar-winner" : ""}`} style={{ width: `${(1 - m.yesProb) * 100}%` }} />
          </>
        )}
      </div>
      <div className="prediction-prob-row">
        {noBetsYet ? (
          <>
            <span style={{ color: "var(--text-3)" }}>YES —</span>
            <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>no bets yet</span>
            <span style={{ color: "var(--text-3)" }}>NO —</span>
          </>
        ) : (
          <>
            <span style={{ color: "var(--success)" }}>YES {yesPct}%</span>
            <span style={{ color: "var(--text-3)" }}>{m.totalPotUsdc.toFixed(0)} USDC pool</span>
            <span style={{ color: "var(--error)" }}>NO {noPct}%</span>
          </>
        )}
      </div>

      {!m.settled && (
        <div className="prediction-bet-row">
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="tourney-input"
            disabled={busy}
            style={{ maxWidth: 80 }}
          />
          <button className="tourney-bet-btn tourney-bet-yes" onClick={() => onBet(0)} disabled={busy}>
            Bet YES
          </button>
          <button className="tourney-bet-btn tourney-bet-no" onClick={() => onBet(1)} disabled={busy}>
            Bet NO
          </button>
        </div>
      )}

      {stake.kind === "running" && (
        <div className="tourney-status">
          <span className="spinner" /> Confirming…
          <button className="tourney-cancel" onClick={() => { clearTimer(); setStake({ kind: "idle" }); }}>cancel</button>
        </div>
      )}
      {stake.kind === "done" && (
        <div className="tourney-status" style={{ color: "var(--success)" }}>
          ✓ Staked · <a href={`${EXPLORER}/tx/${stake.txHash}`} target="_blank" rel="noreferrer">tx</a>
        </div>
      )}
      {stake.kind === "error" && (
        <div className="tourney-status" style={{ color: "var(--error)" }}>
          ✗ {stake.message}
          <button className="tourney-cancel" onClick={() => setStake({ kind: "idle" })}>dismiss</button>
        </div>
      )}

      <div className="prediction-meta">
        M#{m.marketId} · <a href={`${EXPLORER}/tx/${m.createMarketTx}`} target="_blank" rel="noreferrer" className="td-mono">{m.createMarketTx.slice(0, 8)}…</a>
      </div>
    </div>
  );
}
