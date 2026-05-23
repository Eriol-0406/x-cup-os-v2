"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";
import { listFiresByWallet, type FireRecord } from "@/lib/api";

const EXPLORER = "https://www.oklink.com/x-layer-testnet";

type State =
  | { kind: "noWallet" }
  | { kind: "loading" }
  | { kind: "ready"; fires: FireRecord[] }
  | { kind: "error"; message: string };

export function ActivityDashboard() {
  const { state: walletState } = useWallet();
  const [state, setState] = useState<State>({ kind: "noWallet" });

  const refresh = useCallback(async () => {
    if (walletState.kind !== "connected") {
      setState({ kind: "noWallet" });
      return;
    }
    try {
      const fires = await listFiresByWallet(walletState.address);
      setState({ kind: "ready", fires });
    } catch (err: any) {
      setState({ kind: "error", message: err?.message ?? "Failed to load fires" });
    }
  }, [walletState]);

  useEffect(() => {
    refresh();
    // Refresh whenever a deploy completes (Editor emits this) OR every 8s.
    const onDeploy = () => refresh();
    window.addEventListener("xcup:strategy-deployed", onDeploy);
    const t = setInterval(refresh, 8000);
    return () => {
      window.removeEventListener("xcup:strategy-deployed", onDeploy);
      clearInterval(t);
    };
  }, [refresh]);

  return (
    <section id="activity" style={{ marginBottom: 64 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Agent Activity</h2>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
            Every time your agent fires a strategy, the on-chain stake shows up here.
          </div>
        </div>
        {state.kind === "ready" && state.fires.length > 0 && (
          <span className="panel-status">
            <span style={{ color: "var(--success)" }}>●</span> {state.fires.length} fire
            {state.fires.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {state.kind === "noWallet" && (
        <div className="panel">
          <div className="preview-empty">
            <div style={{ fontSize: 28, marginBottom: 8 }}>👛</div>
            <div>Connect your wallet to see agent activity.</div>
          </div>
        </div>
      )}

      {state.kind === "loading" && (
        <div className="loading-card">
          <span className="spinner" /> Loading fires…
        </div>
      )}

      {state.kind === "error" && (
        <div className="error-card">
          <strong>Couldn't load activity</strong> — {state.message}
        </div>
      )}

      {state.kind === "ready" && state.fires.length === 0 && (
        <div className="panel">
          <div className="preview-empty">
            <div style={{ fontSize: 28, marginBottom: 8 }}>📡</div>
            <div>No agent activity yet.</div>
            <div style={{ fontSize: 12, marginTop: 6, color: "var(--text-3)" }}>
              Deploy a strategy above — when a trigger condition hits, the agent fires automatically and the tx
              appears here.
            </div>
          </div>
        </div>
      )}

      {state.kind === "ready" && state.fires.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table className="fires-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Market</th>
                <th>Action</th>
                <th>Triggered by</th>
                <th>Tx</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.fires.map((f) => (
                <FireRow key={f.id} f={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FireRow({ f }: { f: FireRecord }) {
  const when = new Date(f.createdAt).toLocaleTimeString();
  const outcomeLabel = f.outcomeIdx === 0 ? "YES" : "NO";
  const trigger = `${f.matchEvent.homeTeam} ${f.matchEvent.homeScore}–${f.matchEvent.awayScore} ${f.matchEvent.awayTeam}${
    f.matchEvent.scorers.length ? ` · ${f.matchEvent.scorers.join(", ")}` : ""
  }`;
  return (
    <tr>
      <td className="td-mono">{when}</td>
      <td>Market #{f.marketId}</td>
      <td>
        <span className={`tag tag-stake`}>{f.stakeUsdc} USDC</span>{" "}
        <span className={f.outcomeIdx === 0 ? "tag tag-yes" : "tag tag-no"}>{outcomeLabel}</span>
      </td>
      <td style={{ fontSize: 12, color: "var(--text-2)" }}>{trigger}</td>
      <td>
        {f.txHash ? (
          <a href={`${EXPLORER}/tx/${f.txHash}`} target="_blank" rel="noreferrer" className="td-mono">
            {f.txHash.slice(0, 8)}…{f.txHash.slice(-6)}
          </a>
        ) : (
          <span style={{ color: "var(--text-3)" }}>—</span>
        )}
      </td>
      <td>
        <span
          className="tag"
          style={{
            background:
              f.status === "confirmed"
                ? "rgba(74, 222, 128, 0.15)"
                : f.status === "pending"
                  ? "rgba(250, 204, 21, 0.15)"
                  : "rgba(248, 113, 113, 0.15)",
            color:
              f.status === "confirmed"
                ? "var(--success)"
                : f.status === "pending"
                  ? "var(--warn)"
                  : "var(--error)",
          }}
          title={f.failureReason ?? undefined}
        >
          {f.status}
        </span>
      </td>
    </tr>
  );
}
