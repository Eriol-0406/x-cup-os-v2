"use client";

import { useEffect, useState } from "react";
import { fetchOddsComparison, type OddsComparisonResult } from "@/lib/api";

const ARB_THRESHOLD = 0.1; // 10% delta is the rough threshold to flag a sharp opportunity

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: OddsComparisonResult }
  | { kind: "error"; message: string };

export function OddsComparisonPanel({ fixtureId }: { fixtureId: number }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchOddsComparison(fixtureId);
        if (!alive) return;
        setState({ kind: "ready", data });
      } catch (err: any) {
        if (!alive) return;
        setState({ kind: "error", message: err?.message ?? "Failed to load comparison" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [fixtureId]);

  if (state.kind === "loading") {
    return (
      <div className="odds-panel">
        <span className="spinner" /> Loading model + pool…
      </div>
    );
  }
  if (state.kind === "error") {
    return <div className="odds-panel odds-panel-error">✗ {state.message}</div>;
  }

  const { data } = state;
  const { model, pool, delta, fixture } = data;

  if (!model) {
    return (
      <div className="odds-panel">
        <div className="odds-panel-empty">No API-Football prediction available for this fixture.</div>
      </div>
    );
  }

  const labels = fixture.outcomeCount === 3
    ? [
        { key: "home", display: fixture.home, color: "var(--success)" },
        { key: "draw", display: "Draw", color: "var(--text-3)" },
        { key: "away", display: fixture.away, color: "var(--error)" },
      ] as const
    : [
        { key: "home", display: fixture.home, color: "var(--success)" },
        { key: "away", display: fixture.away, color: "var(--error)" },
      ] as const;

  const arbHints: string[] = [];
  if (delta) {
    for (const { key, display } of labels) {
      const d = delta[key as "home" | "draw" | "away"];
      if (Math.abs(d) >= ARB_THRESHOLD) {
        if (d > 0) {
          arbHints.push(`Pool over-prices ${display} by ${(d * 100).toFixed(0)}% vs model — consider FADING (bet against)`);
        } else {
          arbHints.push(`Pool under-prices ${display} by ${(-d * 100).toFixed(0)}% vs model — consider BACKING`);
        }
      }
    }
  }

  return (
    <div className="odds-panel">
      <div className="odds-panel-header">
        <strong>📊 Model vs Pool</strong>
        <span className="odds-panel-meta">
          {model.winner && <>Model picks: <span className="accent">{model.winner}</span></>}
        </span>
      </div>
      <div className="odds-grid">
        <div className="odds-grid-row odds-grid-header">
          <span></span>
          <span className="odds-col">Model %</span>
          <span className="odds-col">Pool %</span>
          <span className="odds-col">Delta</span>
        </div>
        {labels.map(({ key, display, color }) => {
          const mPct = ((model as any)[key] as number) * 100;
          const pPct = ((pool as any)[key] as number) * 100;
          const d = delta ? (delta as any)[key] * 100 : 0;
          const isArb = Math.abs(d) >= ARB_THRESHOLD * 100;
          return (
            <div key={key} className="odds-grid-row">
              <span className="odds-side" style={{ color }}>{display}</span>
              <span className="odds-col">
                <div className="odds-bar-wrap">
                  <div className="odds-bar odds-bar-model" style={{ width: `${mPct}%` }} />
                </div>
                <span className="odds-pct">{mPct.toFixed(0)}%</span>
              </span>
              <span className="odds-col">
                <div className="odds-bar-wrap">
                  <div className="odds-bar odds-bar-pool" style={{ width: `${pPct}%` }} />
                </div>
                <span className="odds-pct">{pPct.toFixed(0)}%</span>
              </span>
              <span
                className="odds-col odds-delta"
                style={{
                  color: isArb ? (d > 0 ? "var(--error)" : "var(--success)") : "var(--text-3)",
                  fontWeight: isArb ? 700 : 400,
                }}
              >
                {d > 0 ? "+" : ""}{d.toFixed(0)}%
                {isArb && " ⚡"}
              </span>
            </div>
          );
        })}
      </div>
      {arbHints.length > 0 && (
        <div className="odds-panel-hints">
          <div className="odds-panel-hints-title">⚡ Arbitrage signals</div>
          <ul>
            {arbHints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="odds-panel-footer">
        <em>Model:</em> {model.advice} · <em>Pool:</em> {pool.totalPotUsdc} USDC pot
      </div>
    </div>
  );
}
