"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listFixtures, fetchStandings, type FixtureRecord, type StandingsTeam } from "@/lib/api";

const ROUND_ORDER = ["Round of 16", "Quarter-finals", "Semi-finals", "Final"] as const;
type Round = (typeof ROUND_ORDER)[number];

/**
 * FIFA's official WC 2026 R32 seeding. Top-to-bottom on each side of the
 * bracket. Labels follow the FIFA convention: "1A" = winner of Group A,
 * "2B" = runner-up of Group B, "3CDEF" = one of the best 3rd-place finishers
 * from groups C / D / E / F. These are the actual published seed slots —
 * who fills them depends on group-stage results.
 */
const R32_LEFT: Array<[string, string]> = [
  ["1E", "3ABCDF"],
  ["1I", "3CDFGH"],
  ["2A", "2B"],
  ["1F", "2C"],
  ["2K", "2L"],
  ["1H", "2J"],
  ["1D", "3BEFIJ"],
  ["1G", "3AEHIJ"],
];
const R32_RIGHT: Array<[string, string]> = [
  ["1C", "2F"],
  ["2E", "2I"],
  ["1A", "3CEFHI"],
  ["1L", "3EHIJK"],
  ["1J", "2H"],
  ["2D", "2G"],
  ["1B", "3EFGIJ"],
  ["1K", "3DEIJL"],
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
          <BracketTree groups={groups} />
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
 * FIFA WC 2026 bracket tree visualization for the empty-state. Two-sided
 * bracket diagram with FIFA's official seed labels in R32, TBD placeholders
 * in R16 / QF / SF / Final / Bronze. Group cards on the far left and right
 * show qualified team flags (when group_letter is known).
 *
 * Rendered when no real knockout fixtures have been synced from API-Football
 * yet — gets replaced by the real BracketMatch grid the moment the R32+
 * fixtures are added to the DB.
 */
function BracketTree({ groups }: { groups: StandingsTeam[][] }) {
  // Map "Group X" → teams. Falls back to empty array if a group isn't synced.
  const teamsByGroup = new Map<string, StandingsTeam[]>();
  for (const g of groups) {
    const letter = g[0]?.group?.replace(/^Group\s+/i, "").trim().toUpperCase();
    if (letter) teamsByGroup.set(letter, g);
  }
  const groupsLeft = ["A", "B", "C", "D", "E", "F"];
  const groupsRight = ["G", "H", "I", "J", "K", "L"];

  return (
    <div className="bracket-tree-wrap">
      <div className="bracket-tree">
        {/* Left half */}
        <BracketSide
          side="left"
          groupLetters={groupsLeft}
          teamsByGroup={teamsByGroup}
          r32={R32_LEFT}
        />

        {/* Center column — Final + trophy + Bronze */}
        <div className="bracket-center-col">
          <div className="bracket-center-label">World Champions</div>
          <div className="bracket-tbd-slot bracket-tbd-final">TBD</div>
          <div className="bracket-trophy">🏆</div>
          <div className="bracket-center-label bracket-center-label-bronze">Bronze Winner</div>
          <div className="bracket-tbd-slot">TBD</div>
        </div>

        {/* Right half (mirror) */}
        <BracketSide
          side="right"
          groupLetters={groupsRight}
          teamsByGroup={teamsByGroup}
          r32={R32_RIGHT}
        />
      </div>
      <div className="bracket-tree-footer">
        <span>
          Labels follow FIFA's official WC 2026 seeding (1A = winner of Group A, 3CDEF = best
          3rd-placed team from C/D/E/F). Slots fill in as group stage concludes.
        </span>
        <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/match" className="btn" style={{ fontSize: 12 }}>
            Group fixtures →
          </Link>
          <Link href="/outrights" className="btn" style={{ fontSize: 12 }}>
            Tournament Winner →
          </Link>
        </span>
      </div>
    </div>
  );
}

function BracketSide({
  side,
  groupLetters,
  teamsByGroup,
  r32,
}: {
  side: "left" | "right";
  groupLetters: string[];
  teamsByGroup: Map<string, StandingsTeam[]>;
  r32: Array<[string, string]>;
}) {
  return (
    <div className={`bracket-side bracket-side-${side}`}>
      <div className="bracket-groups-col">
        {groupLetters.map((g) => (
          <GroupCard key={g} letter={g} teams={teamsByGroup.get(g) ?? []} />
        ))}
      </div>
      <div className="bracket-round-col bracket-round-r32">
        {r32.map(([a, b], i) => (
          <div key={i} className="bracket-tbd-slot bracket-tbd-pair">
            <span>{a}</span>
            <span className="bracket-tbd-divider" />
            <span>{b}</span>
          </div>
        ))}
      </div>
      <div className="bracket-round-col bracket-round-r16">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bracket-tbd-slot">TBD</div>
        ))}
      </div>
      <div className="bracket-round-col bracket-round-qf">
        {[0, 1].map((i) => (
          <div key={i} className="bracket-tbd-slot">TBD</div>
        ))}
      </div>
      <div className="bracket-round-col bracket-round-sf">
        <div className="bracket-tbd-slot">TBD</div>
      </div>
    </div>
  );
}

function GroupCard({ letter, teams }: { letter: string; teams: StandingsTeam[] }) {
  return (
    <div className="bracket-group-pill">
      <div className="bracket-group-flags">
        {[0, 1, 2, 3].map((i) => {
          const team = teams[i];
          if (!team) {
            return <span key={i} className="bracket-group-flag-empty" />;
          }
          return (
            <Image
              key={i}
              src={team.team.logo}
              alt={team.team.name}
              width={20}
              height={20}
              unoptimized
              className="bracket-group-flag"
            />
          );
        })}
      </div>
      <div className="bracket-group-label">Group {letter}</div>
    </div>
  );
}

