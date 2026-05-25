"use client";

import { useEffect, useState } from "react";
import { listAllPlayerProps } from "@/lib/api";
import { PlayerPropsPanel } from "./PlayerPropsPanel";

type Row = Awaited<ReturnType<typeof listAllPlayerProps>>[number];

export function SpecialsGrid() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await listAllPlayerProps();
        if (!alive) return;
        setRows(all);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load player-prop markets");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Specials — First Scorer Markets</h2>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
          Per-fixture player-prop markets. Real player outcomes from API-Football events. Bet on who scores first.
        </div>
      </div>

      {loading && <div className="loading-card"><span className="spinner" /> Loading…</div>}
      {error && <div className="error-card">✗ {error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="preview-empty">No first-scorer markets yet. Run <code>POST /admin/create-first-scorer-markets</code>.</div>
      )}

      {!loading && rows.length > 0 && (
        <div className="specials-list">
          {rows.map((r) => (
            <div key={r.id} className="specials-row">
              <button
                className="specials-header"
                onClick={() => setExpanded(expanded === r.fixtureId ? null : r.fixtureId)}
              >
                <span className="specials-round">{r.round}</span>
                <span className="specials-match">{r.home} vs {r.away}</span>
                <span className="specials-meta">
                  {r.outcomeCount} outcomes · M#{r.marketId}
                  {r.settled && " · Settled"}
                </span>
                <span className="specials-chevron">{expanded === r.fixtureId ? "▾" : "▸"}</span>
              </button>
              {expanded === r.fixtureId && <PlayerPropsPanel fixtureId={r.fixtureId} refreshKey={0} />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
