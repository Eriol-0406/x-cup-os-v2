"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { listFixtures, type FixtureRecord } from "@/lib/api";

const ROUND_ORDER = ["Round of 16", "Quarter-finals", "Semi-finals", "Final"] as const;
type Round = (typeof ROUND_ORDER)[number];

export function KnockoutBracket() {
  const [fixtures, setFixtures] = useState<FixtureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await listFixtures("all");
        if (!alive) return;
        setFixtures(all.filter((f) => ROUND_ORDER.includes(f.round as Round)));
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load fixtures");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="loading-card">
        <span className="spinner" /> Loading bracket…
      </div>
    );
  }
  if (error) {
    return <div className="error-card">✗ {error}</div>;
  }

  const byRound = ROUND_ORDER.map((r) => fixtures.filter((f) => f.round === r));

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Knockout Bracket</h2>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
          Live read of WC 2022 knockout markets. Click any match → fixture detail. Winner team highlighted in green.
        </div>
      </div>

      <div className="bracket-wrap">
        {byRound.map((round, idx) => (
          <div key={ROUND_ORDER[idx]} className="bracket-column">
            <div className="bracket-round-title">{ROUND_ORDER[idx]}</div>
            <div className="bracket-matches" style={{ "--space": `${idx * 18}px` } as any}>
              {round.map((f) => (
                <BracketMatch key={f.id} f={f} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BracketMatch({ f }: { f: FixtureRecord }) {
  const settled = ["FT", "AET", "PEN"].includes(f.status);
  let winningSide: "home" | "away" | "draw" | null = null;
  if (settled && f.home.goals !== null && f.away.goals !== null) {
    if (f.home.goals > f.away.goals) winningSide = "home";
    else if (f.away.goals > f.home.goals) winningSide = "away";
    else if (f.penalty) {
      winningSide = f.penalty.home > f.penalty.away ? "home" : "away";
    } else winningSide = "draw";
  }

  return (
    <div className="bracket-match">
      <div className={`bracket-team${winningSide === "home" ? " bracket-team-winner" : ""}`}>
        <Image src={f.home.logo} alt={f.home.name} width={20} height={20} unoptimized />
        <span className="bracket-team-name">{f.home.name}</span>
        <span className="bracket-team-score">{f.home.goals ?? "-"}</span>
      </div>
      <div className={`bracket-team${winningSide === "away" ? " bracket-team-winner" : ""}`}>
        <Image src={f.away.logo} alt={f.away.name} width={20} height={20} unoptimized />
        <span className="bracket-team-name">{f.away.name}</span>
        <span className="bracket-team-score">{f.away.goals ?? "-"}</span>
      </div>
      <div className="bracket-meta">
        {f.penalty && <span>(P {f.penalty.home}-{f.penalty.away}) · </span>}
        {f.market && <span>M#{f.market.marketId}</span>}
      </div>
    </div>
  );
}
