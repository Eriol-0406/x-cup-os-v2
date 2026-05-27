"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { fetchLineups, type LineupTeam } from "@/lib/api";

type State =
  | { kind: "loading" }
  | { kind: "ready"; teams: LineupTeam[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function LineupsPanel({ fixtureId }: { fixtureId: number }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const teams = await fetchLineups(fixtureId);
        if (!alive) return;
        if (teams.length === 0) setState({ kind: "empty" });
        else setState({ kind: "ready", teams });
      } catch (err: any) {
        if (!alive) return;
        setState({ kind: "error", message: err?.message ?? "Failed to load lineups" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [fixtureId]);

  if (state.kind === "loading") {
    return (
      <div className="lineups-panel">
        <span className="spinner" /> Loading lineups…
      </div>
    );
  }
  if (state.kind === "empty") {
    return (
      <div className="lineups-panel lineups-panel-empty">
        No starting lineup data available for this fixture.
      </div>
    );
  }
  if (state.kind === "error") {
    return <div className="lineups-panel lineups-panel-error">✗ {state.message}</div>;
  }

  return (
    <div className="lineups-panel">
      <div className="lineups-grid">
        {state.teams.map((t) => (
          <TeamLineup key={t.team.id} t={t} />
        ))}
      </div>
    </div>
  );
}

function TeamLineup({ t }: { t: LineupTeam }) {
  return (
    <div className="lineup-team">
      <div className="lineup-team-header">
        <Image src={t.team.logo} alt={t.team.name} width={22} height={22} unoptimized />
        <strong>{t.team.name}</strong>
        <span className="lineup-formation">{t.formation}</span>
      </div>
      {t.coach && (
        <div className="lineup-coach">
          <span>Coach:</span> <strong>{t.coach.name}</strong>
        </div>
      )}
      <ol className="lineup-list">
        {t.startXI.map((p) => (
          <li key={p.id}>
            <a className="lineup-player-link" href={`/player/${p.id}`}>
              <span className="lineup-number">{p.number}</span>
              <span className="lineup-name">{p.name}</span>
              {p.pos && <span className="lineup-pos">{p.pos}</span>}
            </a>
          </li>
        ))}
      </ol>
      {t.substitutes.length > 0 && (
        <details className="lineup-subs">
          <summary>Substitutes ({t.substitutes.length})</summary>
          <ul>
            {t.substitutes.map((p) => (
              <li key={p.id}>
                <a className="lineup-player-link" href={`/player/${p.id}`}>
                  <span className="lineup-number">{p.number}</span>
                  <span className="lineup-name">{p.name}</span>
                  {p.pos && <span className="lineup-pos">{p.pos}</span>}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
