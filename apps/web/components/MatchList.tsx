"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  listFixtures,
  listCachedTeams,
  replayFixture,
  isLiveStatus,
  isFinishedStatus,
  statusLabel,
  type FixtureRecord,
  type FixtureStatusFilter,
  type ReplayResponse,
} from "@/lib/api";
import { MarketFilter } from "./MarketFilter";
import { PlayerPropsPanel } from "./PlayerPropsPanel";
import { H2HModal } from "./H2HModal";
import { OddsComparisonPanel } from "./OddsComparisonPanel";
import { LineupsPanel } from "./LineupsPanel";

const EXPLORER = "https://www.oklink.com/x-layer-testnet";

type State =
  | { kind: "loading" }
  | { kind: "ready"; fixtures: FixtureRecord[]; refreshedAt: number }
  | { kind: "error"; message: string };

export function MatchList() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [filter, setFilter] = useState<FixtureStatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [teamGroup, setTeamGroup] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [fixtures, teams] = await Promise.all([listFixtures("all"), listCachedTeams()]);
        if (!alive) return;
        const tg: Record<number, string> = {};
        for (const t of teams) {
          if (t.groupLetter) tg[t.id] = t.groupLetter;
        }
        setTeamGroup(tg);
        setState({ kind: "ready", fixtures, refreshedAt: Date.now() });
      } catch (err: any) {
        if (!alive) return;
        setState({ kind: "error", message: err?.message ?? "Failed to load fixtures" });
      }
    };
    load();
    const t = setInterval(load, 30_000); // refresh every 30s
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const groupLetters = useMemo(() => {
    const set = new Set<string>();
    for (const g of Object.values(teamGroup)) set.add(g);
    return ["all", ...Array.from(set).sort()];
  }, [teamGroup]);

  // Counts for filter pills
  const counts = useMemo<Record<FixtureStatusFilter, number>>(() => {
    if (state.kind !== "ready") return { all: 0, live: 0, upcoming: 0, finished: 0 };
    const all = state.fixtures.length;
    let live = 0,
      upcoming = 0,
      finished = 0;
    for (const f of state.fixtures) {
      if (isLiveStatus(f.status)) live++;
      else if (isFinishedStatus(f.status)) finished++;
      else upcoming++;
    }
    return { all, live, upcoming, finished };
  }, [state]);

  const filtered = useMemo(() => {
    if (state.kind !== "ready") return [];
    let pool = state.fixtures;
    switch (filter) {
      case "live":
        pool = pool.filter((f) => isLiveStatus(f.status));
        break;
      case "upcoming":
        pool = pool.filter((f) => !isLiveStatus(f.status) && !isFinishedStatus(f.status));
        break;
      case "finished":
        pool = pool.filter((f) => isFinishedStatus(f.status));
        break;
    }
    if (groupFilter !== "all") {
      pool = pool.filter(
        (f) => teamGroup[f.home.id] === groupFilter || teamGroup[f.away.id] === groupFilter,
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      pool = pool.filter(
        (f) =>
          f.home.name.toLowerCase().includes(q) ||
          f.away.name.toLowerCase().includes(q) ||
          f.round.toLowerCase().includes(q),
      );
    }
    return pool;
  }, [state, filter, groupFilter, teamGroup, search]);

  return (
    <section id="matches" style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Live Markets</h2>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
            Fixtures synced from API-Football. On-chain markets created lazily per fixture.
          </div>
        </div>
        {state.kind === "ready" && (
          <span className="panel-status">
            <span style={{ color: "var(--success)" }}>●</span> {filtered.length} of {state.fixtures.length} fixtures
          </span>
        )}
      </div>

      {state.kind === "ready" && (
        <div style={{ marginBottom: 12 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by team name, round (e.g. Argentina, Final)…"
            className="strategy-input"
            style={{ minHeight: 38, padding: "8px 14px", fontSize: 13, width: "100%", maxWidth: 420 }}
          />
        </div>
      )}

      {state.kind === "ready" && <MarketFilter current={filter} onChange={setFilter} counts={counts} />}

      {state.kind === "ready" && groupLetters.length > 1 && (
        <div className="group-filter-row">
          <span className="group-filter-label">Group</span>
          <div className="filter-pills" style={{ marginBottom: 0 }}>
            {groupLetters.map((g) => (
              <button
                key={g}
                className={`filter-pill${groupFilter === g ? " filter-pill-active" : ""}`}
                onClick={() => setGroupFilter(g)}
              >
                <span>{g === "all" ? "All Groups" : `Group ${g}`}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {state.kind === "loading" && (
        <div className="loading-card" style={{ marginTop: 14 }}>
          <span className="spinner" /> Loading fixtures…
        </div>
      )}

      {state.kind === "error" && (
        <div className="error-card" style={{ marginTop: 14 }}>
          <strong>Couldn't load fixtures</strong> — {state.message}
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)" }}>
            Run <code>POST /admin/sync-fixtures</code> if the DB is empty.
          </div>
        </div>
      )}

      {state.kind === "ready" && filtered.length === 0 && (
        <div className="preview-empty" style={{ marginTop: 14 }}>
          No fixtures in this category yet.
        </div>
      )}

      {state.kind === "ready" && filtered.length > 0 && (
        <div className="match-grid">
          {filtered.map((f) => (
            <FixtureCard key={f.id} f={f} />
          ))}
        </div>
      )}
    </section>
  );
}

type ReplayState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: ReplayResponse }
  | { kind: "error"; message: string };

function FixtureCard({ f }: { f: FixtureRecord }) {
  const live = isLiveStatus(f.status);
  const done = isFinishedStatus(f.status);
  const winningSide =
    done && f.home.goals !== null && f.away.goals !== null
      ? f.home.goals > f.away.goals
        ? "home"
        : f.away.goals > f.home.goals
          ? "away"
          : "draw"
      : null;

  const [replay, setReplay] = useState<ReplayState>({ kind: "idle" });
  const [propsOpen, setPropsOpen] = useState(false);
  const [propsRefresh, setPropsRefresh] = useState(0);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [lineupsOpen, setLineupsOpen] = useState(false);
  const [h2hOpen, setH2hOpen] = useState(false);

  const onReplay = async () => {
    setReplay({ kind: "running" });
    try {
      const result = await replayFixture(f.id);
      if (result.ok) {
        setReplay({ kind: "done", result });
        window.dispatchEvent(new CustomEvent("xcup:replay-done", { detail: { fixtureId: f.id } }));
        setPropsRefresh((n) => n + 1);
      } else {
        setReplay({ kind: "error", message: result.error ?? "Replay failed" });
      }
    } catch (err: any) {
      setReplay({ kind: "error", message: err?.message ?? "Replay failed" });
    }
  };

  return (
    <div className={`match-card${live ? " match-card-live" : ""}`}>
      <div className="match-card-header">
        <span className="match-id-label">
          {f.round}
          {f.market && ` · M#${f.market.marketId}`}
        </span>
        <span className={`status-pill ${pillClass(f.status)}`}>
          {live && <span style={{ color: "var(--success)", marginRight: 4 }}>●</span>}
          {statusLabel(f.status)}
        </span>
      </div>

      <div className="match-teams">
        <div className={`team-side${winningSide === "home" ? " team-winner" : ""}`}>
          <Image
            src={f.home.logo}
            alt={f.home.name}
            width={48}
            height={48}
            unoptimized
            className="team-logo"
          />
          <div className="team-code">{f.home.name}</div>
        </div>
        <div className="match-score">
          {f.home.goals !== null && f.away.goals !== null ? (
            <>
              <span className="score-num">{f.home.goals}</span>
              <span className="score-dash">–</span>
              <span className="score-num">{f.away.goals}</span>
              {f.penalty && (
                <div className="score-pen">
                  (P {f.penalty.home}–{f.penalty.away})
                </div>
              )}
            </>
          ) : (
            <div className="vs">vs</div>
          )}
        </div>
        <div className={`team-side${winningSide === "away" ? " team-winner" : ""}`}>
          <Image
            src={f.away.logo}
            alt={f.away.name}
            width={48}
            height={48}
            unoptimized
            className="team-logo"
          />
          <div className="team-code">{f.away.name}</div>
        </div>
      </div>

      <div className="match-footer">
        <span className="match-meta">{formatDateLine(f.date)}</span>
        <span className="match-meta">
          {f.venue ? `${f.venue.city}` : "—"}
          {f.market ? ` · M#${f.market.marketId}` : " · pending"}
        </span>
      </div>

      <div className="prop-toggle-row">
        <button className="btn prop-toggle-btn" onClick={() => setH2hOpen(true)}>
          ⚔️ H2H History
        </button>
        {done && (
          <button className="btn prop-toggle-btn" onClick={() => setPropsOpen((v) => !v)}>
            🎯 {propsOpen ? "Hide first-scorer odds" : "First-scorer odds"}
          </button>
        )}
        <button className="btn prop-toggle-btn" onClick={() => setOddsOpen((v) => !v)}>
          📊 {oddsOpen ? "Hide model vs pool" : "Model vs pool"}
        </button>
        <button className="btn prop-toggle-btn" onClick={() => setLineupsOpen((v) => !v)}>
          👥 {lineupsOpen ? "Hide lineups" : "Lineups"}
        </button>
      </div>
      {propsOpen && <PlayerPropsPanel fixtureId={f.id} refreshKey={propsRefresh} />}
      {oddsOpen && <OddsComparisonPanel fixtureId={f.id} />}
      {lineupsOpen && <LineupsPanel fixtureId={f.id} />}
      {h2hOpen && (
        <H2HModal teamA={f.home} teamB={f.away} onClose={() => setH2hOpen(false)} />
      )}

      {done && f.market && (
        <div className="replay-row">
          {replay.kind === "idle" && (
            <button className="btn replay-btn" onClick={onReplay} title="Pull this match's real outcome and run the full agent loop on-chain">
              Replay this match →
            </button>
          )}
          {replay.kind === "running" && (
            <div className="replay-status">
              <span className="spinner" /> Firing strategies + settling…
            </div>
          )}
          {replay.kind === "done" && replay.result.ok && (
            <div className="replay-result">
              <div style={{ color: "var(--success)", fontWeight: 600, fontSize: 12 }}>
                ✓ Replayed · {replay.result.fires?.length ?? 0} fire(s) · {replay.result.settle?.claims.length ?? 0} claim(s)
              </div>
              {replay.result.settle?.settleTx && replay.result.settle.settleTx.startsWith("0x") && (
                <a
                  className="td-mono replay-link"
                  href={`${EXPLORER}/tx/${replay.result.settle.settleTx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  settle tx ↗
                </a>
              )}
            </div>
          )}
          {replay.kind === "error" && (
            <div className="replay-error">✗ {replay.message}</div>
          )}
        </div>
      )}
    </div>
  );
}

function pillClass(s: string): string {
  if (isLiveStatus(s as any)) return "status-live";
  if (isFinishedStatus(s as any)) return "status-settled";
  return "status-open";
}

function formatDateLine(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
