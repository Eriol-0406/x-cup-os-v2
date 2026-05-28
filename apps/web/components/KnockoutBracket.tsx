"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listFixtures, fetchStandings, type FixtureRecord, type StandingsTeam } from "@/lib/api";

const ROUND_ORDER = ["Round of 16", "Quarter-finals", "Semi-finals", "Final"] as const;
type Round = (typeof ROUND_ORDER)[number];

/**
 * Structural bracket for WC 2026 — used when no actual knockout fixtures
 * have been published by API-Football yet. Shows the shape of the tournament
 * (R32 → R16 → QF → SF → Final + 3rd) with placeholder team labels so users
 * can see what's coming. Real fixtures replace this view as they're synced.
 *
 * Group labels (1A, 2B, etc.) follow the standard "1st of Group A" /
 * "2nd of Group B" notation. Best-3rd-placed seeds (3ABCDF style) are
 * intentionally generic — exact FIFA pairings are announced after group
 * stage closes.
 */
type BracketMatchStub = {
  matchNum: number;
  dateLabel: string;
  leftLabel: string;
  rightLabel: string;
};
type BracketStructure = {
  round: string;
  matches: BracketMatchStub[];
};
const WC2026_STRUCTURE: BracketStructure[] = [
  {
    round: "Round of 32",
    matches: [
      { matchNum: 73, dateLabel: "Jun 30, 12:00", leftLabel: "1A", rightLabel: "3CDEF" },
      { matchNum: 74, dateLabel: "Jun 30, 16:00", leftLabel: "1B", rightLabel: "2F" },
      { matchNum: 75, dateLabel: "Jun 30, 20:00", leftLabel: "1C", rightLabel: "2E" },
      { matchNum: 76, dateLabel: "Jul 1, 12:00",  leftLabel: "1D", rightLabel: "3BEFI" },
      { matchNum: 77, dateLabel: "Jul 1, 16:00",  leftLabel: "1E", rightLabel: "3ABCDF" },
      { matchNum: 78, dateLabel: "Jul 1, 20:00",  leftLabel: "1F", rightLabel: "2C" },
      { matchNum: 79, dateLabel: "Jul 2, 12:00",  leftLabel: "1G", rightLabel: "3ABEHJ" },
      { matchNum: 80, dateLabel: "Jul 2, 16:00",  leftLabel: "1H", rightLabel: "2J" },
      { matchNum: 81, dateLabel: "Jul 2, 20:00",  leftLabel: "1I", rightLabel: "3CDFGH" },
      { matchNum: 82, dateLabel: "Jul 3, 12:00",  leftLabel: "1J", rightLabel: "2L" },
      { matchNum: 83, dateLabel: "Jul 3, 16:00",  leftLabel: "1K", rightLabel: "2A" },
      { matchNum: 84, dateLabel: "Jul 3, 20:00",  leftLabel: "1L", rightLabel: "2B" },
      { matchNum: 85, dateLabel: "Jul 4, 12:00",  leftLabel: "2D", rightLabel: "2G" },
      { matchNum: 86, dateLabel: "Jul 4, 16:00",  leftLabel: "2H", rightLabel: "2I" },
      { matchNum: 87, dateLabel: "Jul 4, 20:00",  leftLabel: "2K", rightLabel: "3GHIJK" },
      { matchNum: 88, dateLabel: "Jul 5, 12:00",  leftLabel: "3EFHIJ", rightLabel: "3DGHIK" },
    ],
  },
  {
    round: "Round of 16",
    matches: Array.from({ length: 8 }, (_, i) => ({
      matchNum: 89 + i,
      dateLabel: `Jul ${7 + Math.floor(i / 2)}, ${i % 2 === 0 ? "16:00" : "20:00"}`,
      leftLabel: `W${73 + i * 2}`,
      rightLabel: `W${74 + i * 2}`,
    })),
  },
  {
    round: "Quarter-finals",
    matches: Array.from({ length: 4 }, (_, i) => ({
      matchNum: 97 + i,
      dateLabel: `Jul ${11 + Math.floor(i / 2)}, ${i % 2 === 0 ? "16:00" : "20:00"}`,
      leftLabel: `W${89 + i * 2}`,
      rightLabel: `W${90 + i * 2}`,
    })),
  },
  {
    round: "Semi-finals",
    matches: [
      { matchNum: 101, dateLabel: "Jul 14, 20:00", leftLabel: "W97", rightLabel: "W98" },
      { matchNum: 102, dateLabel: "Jul 15, 20:00", leftLabel: "W99", rightLabel: "W100" },
    ],
  },
  {
    round: "3rd Place + Final",
    matches: [
      { matchNum: 103, dateLabel: "Jul 18, 16:00", leftLabel: "L101", rightLabel: "L102" },
      { matchNum: 104, dateLabel: "Jul 19, 16:00", leftLabel: "W101", rightLabel: "W102" },
    ],
  },
];

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
          <StructuralBracket />
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

/**
 * Renders the WC 2026 tournament structure with placeholder labels (1A, 2B,
 * W74, etc.) — used as the empty-state fallback when no actual knockout
 * fixtures are in the DB yet. Shows the *shape* of the bracket and
 * estimated dates so users can see what's coming.
 */
function StructuralBracket() {
  return (
    <>
      <div
        style={{
          fontSize: 11,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: "var(--text-3)",
          marginBottom: 16,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        ⓘ Tournament structure preview · pairings update as group stage concludes
      </div>
      <div className="structural-bracket">
        {WC2026_STRUCTURE.map((col) => (
          <div key={col.round} className="structural-bracket-column">
            <div className="structural-bracket-round-title">{col.round}</div>
            <div className="structural-bracket-matches">
              {col.matches.map((m) => (
                <div key={m.matchNum} className="structural-bracket-card">
                  <div className="structural-bracket-card-head">
                    <span>{m.dateLabel}</span>
                    <span className="structural-bracket-card-num">M{m.matchNum}</span>
                  </div>
                  <div className="structural-bracket-row">
                    <span className="structural-bracket-avatar" />
                    <span className="structural-bracket-team">{m.leftLabel}</span>
                  </div>
                  <div className="structural-bracket-row">
                    <span className="structural-bracket-avatar" />
                    <span className="structural-bracket-team">{m.rightLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 24,
          padding: 16,
          background: "rgba(91, 140, 255, 0.06)",
          border: "1px solid var(--accent-dim)",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--text-2)",
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: "var(--accent)" }}>Want to bet now?</strong> The
        per-team <Link href="/outrights">Tournament Winner</Link> and{" "}
        <Link href="/outrights">To Reach Final</Link> outrights are already live —
        place positions on Argentina, France, Brazil, etc. without waiting for the
        bracket to fill in. Once knockouts are announced, individual match markets
        will appear on the <Link href="/match">Match page</Link>.
      </div>
    </>
  );
}
