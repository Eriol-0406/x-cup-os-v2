"use client";

import { useCallback, useEffect, useState } from "react";
import { listLeaderboard, copyStrategy, type LeaderboardEntry } from "@/lib/api";
import { useWallet } from "./WalletProvider";

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready"; entries: LeaderboardEntry[]; refreshedAt: number }
  | { kind: "error"; message: string };

type CopyState =
  | { kind: "idle" }
  | { kind: "copying"; strategyId: string }
  | { kind: "done"; cloneId: string }
  | { kind: "error"; message: string };

export function Leaderboard() {
  const { state: walletState, connect } = useWallet();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [copyState, setCopyState] = useState<CopyState>({ kind: "idle" });

  const refresh = useCallback(async () => {
    try {
      const entries = await listLeaderboard(15);
      if (entries.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      setState({ kind: "ready", entries, refreshedAt: Date.now() });
    } catch (err: any) {
      setState({ kind: "error", message: err?.message ?? "Failed to load leaderboard" });
    }
  }, []);

  useEffect(() => {
    refresh();
    const onDeploy = () => refresh();
    window.addEventListener("xcup:strategy-deployed", onDeploy);
    const t = setInterval(refresh, 20_000); // refresh every 20s
    return () => {
      window.removeEventListener("xcup:strategy-deployed", onDeploy);
      clearInterval(t);
    };
  }, [refresh]);

  const onCopy = async (e: LeaderboardEntry) => {
    if (walletState.kind !== "connected") {
      void connect();
      return;
    }
    setCopyState({ kind: "copying", strategyId: e.strategyId });
    try {
      const result = await copyStrategy(e.strategyId, walletState.address);
      if (!result.ok) {
        setCopyState({ kind: "error", message: result.error ?? "Copy failed" });
        return;
      }
      setCopyState({ kind: "done", cloneId: result.cloneId! });
      window.dispatchEvent(new CustomEvent("xcup:strategy-deployed", { detail: { id: result.cloneId } }));
      refresh();
    } catch (err: any) {
      setCopyState({ kind: "error", message: err?.message ?? "Copy failed" });
    }
  };

  return (
    <section id="leaderboard" style={{ marginBottom: 64 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Leaderboard</h2>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
            Top public strategies ranked by PnL. Click "Copy" to clone an agent into your account.
          </div>
        </div>
        {state.kind === "ready" && (
          <span className="panel-status">{state.entries.length} strategies</span>
        )}
      </div>

      {state.kind === "loading" && (
        <div className="loading-card">
          <span className="spinner" /> Loading leaderboard…
        </div>
      )}
      {state.kind === "empty" && (
        <div className="panel">
          <div className="preview-empty">
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏆</div>
            <div>No strategies yet — deploy one above to take the top spot.</div>
          </div>
        </div>
      )}
      {state.kind === "error" && (
        <div className="error-card">
          <strong>Couldn't load leaderboard</strong> — {state.message}
        </div>
      )}
      {state.kind === "ready" && (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Owner</th>
                <th>Strategy</th>
                <th style={{ width: 70 }}>Fires</th>
                <th style={{ width: 90 }}>PnL</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {state.entries.map((e) => {
                const isMine = walletState.kind === "connected" && walletState.address.toLowerCase() === e.ownerFull.toLowerCase();
                const isCopying = copyState.kind === "copying" && copyState.strategyId === e.strategyId;
                const pnlColor = e.currentPnlUsdc > 0 ? "var(--success)" : e.currentPnlUsdc < 0 ? "var(--error)" : "var(--text-3)";
                return (
                  <tr key={e.strategyId}>
                    <td className="lb-rank">{rankBadge(e.rank)}</td>
                    <td className="td-mono" title={e.ownerFull}>
                      {e.ownerShort}
                      {isMine && <span className="lb-you-tag">YOU</span>}
                    </td>
                    <td className="lb-text" title={e.englishText}>
                      {e.englishText.length > 80 ? e.englishText.slice(0, 80) + "…" : e.englishText}
                    </td>
                    <td className="lb-num">{e.fireCount}</td>
                    <td className="lb-num" style={{ color: pnlColor, fontWeight: 600 }}>
                      {e.currentPnlUsdc > 0 ? "+" : ""}{e.currentPnlUsdc.toFixed(2)}
                    </td>
                    <td>
                      <span className={`status-pill ${statusClass(e.status)}`}>{e.status}</span>
                    </td>
                    <td>
                      {isMine ? (
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>your own</span>
                      ) : (
                        <button className="btn lb-copy-btn" disabled={isCopying} onClick={() => onCopy(e)}>
                          {isCopying ? "Copying…" : "Copy →"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {copyState.kind === "done" && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--success)" }}>
          ✓ Strategy cloned + activated in your account. Replay any matching fixture to see it fire.
        </div>
      )}
      {copyState.kind === "error" && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--error)" }}>
          ✗ {copyState.message}{" "}
          <button className="tourney-cancel" onClick={() => setCopyState({ kind: "idle" })}>dismiss</button>
        </div>
      )}
    </section>
  );
}

function rankBadge(rank: number): React.ReactNode {
  if (rank === 1) return <span className="lb-medal lb-medal-1">🥇</span>;
  if (rank === 2) return <span className="lb-medal lb-medal-2">🥈</span>;
  if (rank === 3) return <span className="lb-medal lb-medal-3">🥉</span>;
  return <span style={{ color: "var(--text-3)" }}>{rank}</span>;
}

function statusClass(s: string): string {
  switch (s) {
    case "active":
      return "status-open";
    case "exhausted":
      return "status-settled";
    case "expired":
    case "paused":
      return "status-none";
    default:
      return "status-none";
  }
}
