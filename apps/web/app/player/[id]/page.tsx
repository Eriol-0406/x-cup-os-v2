import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Params = { id: string };

async function getPlayer(id: string) {
  try {
    const res = await fetch(`${API_URL}/players/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.ok ? json : null;
  } catch {
    return null;
  }
}

export default async function PlayerPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const data = await getPlayer(id);

  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0" }}>
          <Link href="/specials" style={{ color: "var(--text-3)", fontSize: 13 }}>← Back to Specials</Link>
        </section>

        {!data ? (
          <div className="error-card">
            ✗ Player <code>{id}</code> not found, or API-Football has no data for this season.
          </div>
        ) : (
          <div className="player-profile">
            <div className="player-profile-header">
              {data.player.photo && (
                <Image
                  src={data.player.photo}
                  alt={data.player.name}
                  width={120}
                  height={120}
                  unoptimized
                  className="player-photo"
                />
              )}
              <div>
                <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                  {data.player.name}
                </h1>
                <div style={{ color: "var(--text-2)", marginTop: 6, fontSize: 14 }}>
                  {data.player.firstname} {data.player.lastname}
                  {data.player.injured && (
                    <span style={{ marginLeft: 8, color: "var(--error)" }}>🩹 Injured</span>
                  )}
                </div>
                <div className="player-meta-row">
                  <span><strong>Nationality:</strong> {data.player.nationality}</span>
                  <span><strong>Age:</strong> {data.player.age}</span>
                  {data.player.height && <span><strong>Height:</strong> {data.player.height}</span>}
                  {data.player.weight && <span><strong>Weight:</strong> {data.player.weight}</span>}
                </div>
                <div className="player-meta-row" style={{ color: "var(--text-3)", fontSize: 12 }}>
                  Born {data.player.birth?.date} in {data.player.birth?.place}, {data.player.birth?.country}
                </div>
              </div>
            </div>

            {data.stats ? (
              <div className="player-stats-card">
                <div className="player-stats-team">
                  <Image src={data.stats.team.logo} alt={data.stats.team.name} width={28} height={28} unoptimized />
                  <strong>{data.stats.team.name}</strong>
                  <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                    · {data.stats.league.name} {data.stats.league.season}
                  </span>
                </div>
                <div className="player-stats-grid">
                  <Stat label="Position" value={data.stats.position} />
                  <Stat label="Apps" value={data.stats.appearances} />
                  <Stat label="Lineups" value={data.stats.lineups} />
                  <Stat label="Minutes" value={data.stats.minutes} />
                  <Stat label="Goals" value={data.stats.goals} accent="success" />
                  <Stat label="Assists" value={data.stats.assists} accent="info" />
                  <Stat label="Rating" value={data.stats.rating ?? "—"} />
                  <Stat label="🟨" value={data.stats.yellow} />
                  <Stat label="🟥" value={data.stats.red} />
                </div>
              </div>
            ) : (
              <div className="preview-empty">
                No stats available for this player in season {API_URL ? "" : ""}.
              </div>
            )}

            <div style={{ marginTop: 24, fontSize: 12, color: "var(--text-3)" }}>
              Data from API-Football. Player id: <code>{data.player.id}</code>.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string | null; accent?: "success" | "info" }) {
  const color = accent === "success" ? "var(--success)" : accent === "info" ? "#5b8cff" : "var(--text-1)";
  return (
    <div className="player-stat">
      <div className="player-stat-label">{label}</div>
      <div className="player-stat-value" style={{ color }}>
        {value ?? "—"}
      </div>
    </div>
  );
}
