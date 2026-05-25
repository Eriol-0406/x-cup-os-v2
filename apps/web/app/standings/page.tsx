import { Header } from "@/components/Header";
import { StandingsTable } from "@/components/StandingsTable";

export default function StandingsPage() {
  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0 16px" }}>
          <div className="kicker">
            <span className="kicker-dot" />
            Live group tables from API-Football
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 8px", letterSpacing: "-0.03em" }}>
            Standings
          </h1>
          <p style={{ color: "var(--text-2)", maxWidth: 700, margin: 0, fontSize: 15 }}>
            Real-time group standings sourced from API-Football. Top 2 from each group qualify for the knockouts
            (highlighted). Updates as matches finish.
          </p>
        </section>
        <StandingsTable />
      </main>
    </div>
  );
}
