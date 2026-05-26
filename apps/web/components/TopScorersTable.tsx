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

  if (loading) return <div className="loading-card"><span className="spinner" /> Loading Golden Boot race…</div>;
  if (error) return <div className="error-card">✗ {error}</div>;
  if (rows.length === 0) return <div className="preview-empty">No top-scorer data returned.</div>;

  return (
    <>
      <div className="callout-link">
        <span>💰 Want to bet on the Golden Boot winner?</span>
        <Link href="/outrights" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 10px" }}>
          Open Top Goalscorer market →
        </Link>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "hidden", marginTop: 12 }}>
        <table className="scorers-table">
          <thead>
            <tr>
              <th className="scorers-rank">#</th>
              <th className="scorers-player">Player</th>
              <th className="scorers-team">Team</th>
              <th className="scorers-num">Goals</th>
              <th className="scorers-num">Assists</th>
              <th className="scorers-num">Apps</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const isLeader = p.goals === rows[0]!.goals;
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
                      <span>{p.team?.name ?? "—"}</span>
                    </span>
                  </td>
                  <td className="scorers-num" style={{ fontWeight: 700, color: isLeader ? "var(--warn)" : "var(--text-1)" }}>
                    {p.goals}
                  </td>
                  <td className="scorers-num">{p.assists}</td>
                  <td className="scorers-num">{p.appearances}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
