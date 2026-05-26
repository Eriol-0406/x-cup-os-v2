"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchStandings, type StandingsTeam } from "@/lib/api";

export function StandingsTable() {
  const [groups, setGroups] = useState<StandingsTeam[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchStandings();
        if (!alive) return;
        setGroups(data);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load standings");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="loading-card"><span className="spinner" /> Loading standings…</div>;
  if (error) return <div className="error-card">✗ {error}</div>;
  if (groups.length === 0) return <div className="preview-empty">No standings data returned by API.</div>;

  return (
    <div className="standings-grid">
      {groups.map((g, idx) => {
        const groupName = g[0]?.group ?? `Group ${idx + 1}`;
        return (
        <div key={idx} className="standings-group">
          <div className="standings-group-header">
            <span className="standings-group-title">{groupName}</span>
            <Link href="/outrights" className="standings-bet-link" title={`Bet on ${groupName} Winner outright`}>
              Bet → Group Winner
            </Link>
          </div>
          <table className="standings-table">
            <thead>
              <tr>
                <th style={{ width: 20 }}>#</th>
                <th>Team</th>
                <th style={{ width: 28 }}>P</th>
                <th style={{ width: 28 }}>W</th>
                <th style={{ width: 28 }}>D</th>
                <th style={{ width: 28 }}>L</th>
                <th style={{ width: 36 }}>GD</th>
                <th style={{ width: 32 }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {g.map((t) => (
                <tr key={t.team.id} className={t.rank <= 2 ? "standings-row-qualifier" : ""}>
                  <td className="lb-num">{t.rank}</td>
                  <td className="standings-team">
                    <Image src={t.team.logo} alt={t.team.name} width={18} height={18} unoptimized />
                    <span>{t.team.name}</span>
                  </td>
                  <td className="lb-num">{t.all.played}</td>
                  <td className="lb-num">{t.all.win}</td>
                  <td className="lb-num">{t.all.draw}</td>
                  <td className="lb-num">{t.all.lose}</td>
                  <td className="lb-num">{t.goalsDiff > 0 ? `+${t.goalsDiff}` : t.goalsDiff}</td>
                  <td className="lb-num" style={{ fontWeight: 700 }}>{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        );
      })}
    </div>
  );
}
