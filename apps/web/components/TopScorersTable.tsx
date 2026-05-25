"use client";

import Image from "next/image";
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

  if (loading) return <div className="loading-card"><span className="spinner" /> Loading Golden Boot race…</div>;
  if (error) return <div className="error-card">✗ {error}</div>;
  if (rows.length === 0) return <div className="preview-empty">No top-scorer data returned.</div>;

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Player</th>
            <th>Team</th>
            <th style={{ width: 60 }}>Goals</th>
            <th style={{ width: 70 }}>Assists</th>
            <th style={{ width: 80 }}>Apps</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const isLeader = p.goals === rows[0]!.goals;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
            return (
              <tr key={p.id}>
                <td className="lb-rank">{medal || i + 1}</td>
                <td className="standings-team" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {p.photo && (
                    <Image src={p.photo} alt={p.name} width={28} height={28} unoptimized style={{ borderRadius: 4 }} />
                  )}
                  <span>{p.name}</span>
                </td>
                <td className="standings-team">
                  {p.team?.logo && <Image src={p.team.logo} alt={p.team.name} width={16} height={16} unoptimized />}
                  <span style={{ color: "var(--text-2)", fontSize: 12 }}>{p.team?.name ?? "—"}</span>
                </td>
                <td className="lb-num" style={{ fontWeight: 700, color: isLeader ? "var(--warn)" : "var(--text-1)" }}>
                  {p.goals}
                </td>
                <td className="lb-num">{p.assists}</td>
                <td className="lb-num">{p.appearances}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
