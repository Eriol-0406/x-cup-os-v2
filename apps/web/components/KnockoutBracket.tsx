"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listFixtures, fetchStandings, type FixtureRecord, type StandingsTeam } from "@/lib/api";

const ROUND_ORDER = ["Round of 16", "Quarter-finals", "Semi-finals", "Final"] as const;
type Round = (typeof ROUND_ORDER)[number];


export function KnockoutBracket() {
  const [fixtures, setFixtures] = useState<FixtureRecord[]>([]);
  const [groups, setGroups] = useState<StandingsTeam[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [all, gs] = await Promise.all([listFixtures("all"), fetchStandings()]);
        if (!alive) return;
        setFixtures(all.filter((f) => ROUND_ORDER.includes(f.round as Round)));
        setGroups(gs);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load bracket data");
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
    <>
      {/* Group stage section — shows how teams qualified into the bracket */}
      {groups.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
              Group Stage
            </h2>
            <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
              How the 32 teams sorted into the knockout 16. Top 2 of each group qualified (green).
            </div>
          </div>
          <div className="bracket-groups">
            {groups.map((teams, idx) => (
              <div key={idx} className="bracket-group-card">
                <div className="bracket-group-title">{teams[0]?.group ?? `Group ${idx + 1}`}</div>
                <table className="bracket-group-table">
                  <thead>
                    <tr>
                      <th style={{ width: 22 }}>#</th>
                      <th>Team</th>
                      <th style={{ width: 28 }}>P</th>
                      <th style={{ width: 28 }}>GD</th>
                      <th style={{ width: 34 }}>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((t) => (
                      <tr
                        key={t.team.id}
                        className={t.rank <= 2 ? "bracket-group-row-qualifier" : ""}
                      >
                        <td style={{ color: "var(--text-3)" }}>{t.rank}</td>
                        <td className="bracket-group-team-cell">
                          <Image
                            src={t.team.logo}
                            alt={t.team.name}
                            width={16}
                            height={16}
                            unoptimized
                          />
                          <span>{t.team.name}</span>
                        </td>
                        <td>{t.all.played}</td>
                        <td>{t.goalsDiff >= 0 ? `+${t.goalsDiff}` : t.goalsDiff}</td>
                        <td style={{ fontWeight: 700 }}>{t.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 64 }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Knockout Bracket
          </h2>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
            {fixtures.length > 0
              ? `${fixtures.length} knockout match${fixtures.length === 1 ? "" : "es"} across R16 → QF → SF → Final. Winners highlighted in green.`
              : "Bracket fills in as the group stage concludes — pairings depend on group results."}
          </div>
        </div>

        {fixtures.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 32,
              textAlign: "center",
              border: "1px dashed var(--border)",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏟️</div>
            <strong style={{ fontSize: 15 }}>Knockout bracket not finalized yet</strong>
            <p style={{ color: "var(--text-3)", fontSize: 13, margin: "8px auto 0", maxWidth: 480, lineHeight: 1.5 }}>
              FIFA hasn't published the knockout pairings yet — they depend on the group-stage
              results. Once API-Football syncs the R16 / QF / SF / Final fixtures, matches will
              appear here automatically.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
              <Link href="/match" className="btn">View group-stage fixtures →</Link>
              <Link href="/outrights" className="btn">Bet on Tournament Winner →</Link>
            </div>
          </div>
        ) : (
          <div className="bracket-wrap">
            {byRound.map((round, idx) => (
              <div key={ROUND_ORDER[idx]} className="bracket-column">
                <div className="bracket-round-title">{ROUND_ORDER[idx]}</div>
                <div className="bracket-matches" style={{ "--space": `${idx * 18}px` } as any}>
                  {round.length === 0 ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-3)",
                        textAlign: "center",
                        padding: "20px 8px",
                        border: "1px dashed var(--border)",
                        borderRadius: 6,
                      }}
                    >
                      TBD
                    </div>
                  ) : (
                    round.map((f) => <BracketMatch key={f.id} f={f} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
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

  const content = (
    <>
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
        {f.market && <span>{settled ? "Settled" : "Bet →"} M#{f.market.marketId}</span>}
      </div>
    </>
  );

  // Bracket items are clickable — they link to the /match page where the
  // user can stake on this fixture's 1x2 market + first-scorer + over/under.
  return (
    <Link
      href="/match"
      className="bracket-match"
      title={settled ? "View settled market" : "Open this match's bet options"}
    >
      {content}
    </Link>
  );
}

