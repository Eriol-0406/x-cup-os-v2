"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchTopScorers, type TopScorerRow } from "@/lib/api";

export function TopScorersTable() {
  const [rows, setRows] = useState<TopScorerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchTopScorers();
        if (!alive) return;
        setRows(data);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load top scorers");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Search filter — applied client-side so it's instant
  const [search, setSearch] = useState("");
  const visible = rows.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.team?.name.toLowerCase().includes(q) ||
      p.nationality?.toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="loading-card"><span className="spinner" /> Loading Golden Boot race…</div>;
  if (error) return <div className="error-card">✗ {error}</div>;
  if (rows.length === 0) return <div className="preview-empty">No top-scorer data returned.</div>;

  // If every row has preTournament flag, the backend returned the fallback
  // sportsbook-favorite list. Show odds instead of goal counts in that case.
  const isPreTournament = rows.every((r) => r.preTournament);

  return (
    <>
      <div className="callout-link">
        <span>
          {isPreTournament
            ? "💰 Pre-tournament favorites — bet on the Golden Boot before kickoff"
            : "💰 Want to bet on the Golden Boot winner?"}
        </span>
        <Link href="/outrights" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 10px" }}>
          Open Top Goalscorer market →
        </Link>
      </div>

      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by player, team, or nationality…"
          className="strategy-input"
          style={{ minHeight: 36, padding: "8px 12px", fontSize: 13, width: "100%", maxWidth: 360 }}
        />
      </div>

      <div className="panel" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
        <table className="scorers-table">
          <thead>
            <tr>
              <th className="scorers-rank">#</th>
              <th className="scorers-player">Player</th>
              <th className="scorers-team">Team</th>
              <th className="scorers-num">{isPreTournament ? "Odds" : "Goals"}</th>
              <th className="scorers-num">{isPreTournament ? "" : "Assists"}</th>
              <th className="scorers-num">{isPreTournament ? "" : "Apps"}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, i) => {
              const isLeader = !isPreTournament && p.goals === rows[0]!.goals;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
              return (
                <tr key={p.id}>
                  <td className="scorers-rank">{medal || i + 1}</td>
                  <td className="scorers-player">
                    <span className="scorers-player-inner">
                      {p.photo && (
                        <Image
                          src={p.photo}
                          alt={p.name}
                          width={28}
                          height={28}
                          unoptimized
                          className="scorers-photo"
                        />
                      )}
                      <span className="scorers-name">{p.name}</span>
                    </span>
                  </td>
                  <td className="scorers-team">
                    <span className="scorers-team-inner">
                      {p.team?.logo && (
                        <Image src={p.team.logo} alt={p.team?.name ?? ""} width={18} height={18} unoptimized />
                      )}
                      <span>{p.team?.name ?? p.nationality ?? "—"}</span>
                    </span>
                  </td>
                  <td className="scorers-num" style={{ fontWeight: 700, color: isLeader ? "var(--warn)" : "var(--text-1)" }}>
                    {isPreTournament ? (p.preMarketOdds ?? "—") : p.goals}
                  </td>
                  <td className="scorers-num">{isPreTournament ? "" : p.assists}</td>
                  <td className="scorers-num">{isPreTournament ? "" : p.appearances}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 20, color: "var(--text-3)", fontSize: 13 }}>
                  No players match "{search}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isPreTournament && (
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
          Pre-tournament odds shown in American format. Real goal counts will replace these once WC matches start scoring.
        </div>
      )}
    </>
  );
}
