"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { fetchH2H, type H2HResult } from "@/lib/api";

interface Props {
  teamA: { id: number; name: string; logo: string };
  teamB: { id: number; name: string; logo: string };
  onClose: () => void;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: H2HResult }
  | { kind: "error"; message: string };

export function H2HModal({ teamA, teamB, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchH2H(teamA.id, teamB.id);
        if (!alive) return;
        setState({ kind: "ready", data });
      } catch (err: any) {
        if (!alive) return;
        setState({ kind: "error", message: err?.message ?? "Failed to load H2H" });
      }
    })();
    return () => { alive = false; };
  }, [teamA.id, teamB.id]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sum = state.kind === "ready" ? state.data.summary : null;

  return (
    <div className="h2h-overlay" onClick={onClose}>
      <div className="h2h-modal" onClick={(e) => e.stopPropagation()}>
        <div className="h2h-header">
          <div className="h2h-header-teams">
            <div className="h2h-header-team">
              <Image src={teamA.logo} alt={teamA.name} width={36} height={36} unoptimized />
              <span>{teamA.name}</span>
            </div>
            <span style={{ color: "var(--text-3)" }}>vs</span>
            <div className="h2h-header-team">
              <Image src={teamB.logo} alt={teamB.name} width={36} height={36} unoptimized />
              <span>{teamB.name}</span>
            </div>
          </div>
          <button className="h2h-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {sum && sum.total > 0 && (
          <div className="h2h-summary">
            <div className="h2h-summary-stat">
              <div className="h2h-summary-num" style={{ color: "var(--success)" }}>{sum.aWins}</div>
              <div className="h2h-summary-lbl">{teamA.name} wins</div>
            </div>
            <div className="h2h-summary-stat">
              <div className="h2h-summary-num" style={{ color: "var(--text-3)" }}>{sum.draws}</div>
              <div className="h2h-summary-lbl">Draws</div>
            </div>
            <div className="h2h-summary-stat">
              <div className="h2h-summary-num" style={{ color: "var(--success)" }}>{sum.bWins}</div>
              <div className="h2h-summary-lbl">{teamB.name} wins</div>
            </div>
            <div className="h2h-summary-stat">
              <div className="h2h-summary-num">{sum.total}</div>
              <div className="h2h-summary-lbl">Total meetings</div>
            </div>
          </div>
        )}

        <div className="h2h-list">
          {state.kind === "loading" && (
            <div className="loading-card"><span className="spinner" /> Loading history…</div>
          )}
          {state.kind === "error" && (
            <div className="error-card">✗ {state.message}</div>
          )}
          {state.kind === "ready" && state.data.matches.length === 0 && (
            <div className="preview-empty">No historical meetings between these teams in API-Football's database.</div>
          )}
          {state.kind === "ready" && state.data.matches.map((m) => (
            <div key={m.id} className="h2h-row">
              <div className="h2h-row-date">
                <div>{new Date(m.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>
                <div className="h2h-row-league">{m.league}{m.season ? ` ${m.season}` : ""}</div>
              </div>
              <div className="h2h-row-match">
                <div className="h2h-row-team h2h-row-home">
                  <span>{m.home.name}</span>
                  <Image src={m.home.logo} alt={m.home.name} width={18} height={18} unoptimized />
                </div>
                <div className="h2h-row-score">
                  {m.home.goals ?? "-"} : {m.away.goals ?? "-"}
                  {m.penalty && <div className="h2h-row-pen">(P {m.penalty.home}-{m.penalty.away})</div>}
                </div>
                <div className="h2h-row-team h2h-row-away">
                  <Image src={m.away.logo} alt={m.away.name} width={18} height={18} unoptimized />
                  <span>{m.away.name}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
