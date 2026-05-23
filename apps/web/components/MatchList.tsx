"use client";

import { useEffect, useState } from "react";
import {
  fetchAllMarkets,
  parseMatchId,
  flagFor,
  formatUsdcPot,
  formatCloseIn,
  type MarketView,
} from "@/lib/contract";

type State =
  | { kind: "loading" }
  | { kind: "ready"; markets: MarketView[]; refreshedAt: number }
  | { kind: "error"; message: string };

const OUTCOME_LABELS_2: [string, string] = ["YES", "NO"];
const OUTCOME_LABELS_3: [string, string, string] = ["Home", "Draw", "Away"];

export function MatchList() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const markets = await fetchAllMarkets();
        if (!alive) return;
        setState({ kind: "ready", markets, refreshedAt: Date.now() });
      } catch (err: any) {
        if (!alive) return;
        setState({ kind: "error", message: err?.message ?? "Failed to load markets" });
      }
    };
    load();
    const t = setInterval(load, 15_000); // refresh every 15s
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <section id="matches" style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Live Markets</h2>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
            Read directly from <code style={{ fontSize: 12 }}>XCupMarket</code> on X Layer testnet · refreshes every 15s
          </div>
        </div>
        {state.kind === "ready" && (
          <span className="panel-status">
            <span style={{ color: "var(--success)" }}>●</span> {state.markets.length} market
            {state.markets.length === 1 ? "" : "s"} on-chain
          </span>
        )}
      </div>

      {state.kind === "loading" && (
        <div className="loading-card">
          <span className="spinner" /> Reading markets from X Layer…
        </div>
      )}

      {state.kind === "error" && (
        <div className="error-card">
          <strong>Couldn't load markets</strong> — {state.message}
        </div>
      )}

      {state.kind === "ready" && state.markets.length === 0 && (
        <div className="preview-empty">No markets created yet on this deployment.</div>
      )}

      {state.kind === "ready" && state.markets.length > 0 && (
        <div className="match-grid">
          {state.markets.map((m) => (
            <MarketCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function MarketCard({ m }: { m: MarketView }) {
  const { home, away } = parseMatchId(m.matchId);
  const outcomeLabels =
    m.outcomeCount === 2 ? OUTCOME_LABELS_2 : m.outcomeCount === 3 ? OUTCOME_LABELS_3 : null;
  const totalPotUsdc = formatUsdcPot(m.totalPot);

  return (
    <div className="match-card">
      <div className="match-card-header">
        <span className="match-id-label">Market #{m.id}</span>
        <span className={`status-pill status-${m.status.toLowerCase()}`}>{m.status}</span>
      </div>

      <div className="match-teams">
        {home && away ? (
          <>
            <div className="team-side">
              <div className="team-flag">{flagFor(home)}</div>
              <div className="team-code">{home}</div>
            </div>
            <div className="vs">vs</div>
            <div className="team-side">
              <div className="team-flag">{flagFor(away)}</div>
              <div className="team-code">{away}</div>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 16, fontWeight: 600 }}>{m.matchId}</div>
        )}
      </div>

      <div className="match-pots">
        {Array.from({ length: m.outcomeCount }, (_, idx) => {
          const label = outcomeLabels?.[idx] ?? `Outcome ${idx}`;
          const pot = m.outcomePots[idx] ?? 0n;
          const pct = m.totalPot > 0n ? Number((pot * 1000n) / m.totalPot) / 10 : 0;
          const isWinner = m.status === "Settled" && m.winningOutcome === idx;
          return (
            <div key={idx} className={`pot-row${isWinner ? " pot-row-winner" : ""}`}>
              <span className="pot-label">{label}</span>
              <span className="pot-bar-wrap">
                <span className="pot-bar" style={{ width: `${pct}%` }} />
              </span>
              <span className="pot-amount">{formatUsdcPot(pot)}</span>
            </div>
          );
        })}
      </div>

      <div className="match-footer">
        <span className="match-meta">
          Total pot <strong>{totalPotUsdc} USDC</strong>
        </span>
        <span className="match-meta">
          {m.status === "Open" ? `closes in ${formatCloseIn(m.closeTime)}` : "—"}
        </span>
      </div>
    </div>
  );
}
