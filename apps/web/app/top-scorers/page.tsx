import { Header } from "@/components/Header";
import { TopScorersTable } from "@/components/TopScorersTable";

export default function TopScorersPage() {
  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0 16px" }}>
          <div className="kicker">
            <span className="kicker-dot" />
            Golden Boot race
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 8px", letterSpacing: "-0.03em" }}>
            Top Scorers
          </h1>
          <p style={{ color: "var(--text-2)", maxWidth: 700, margin: 0, fontSize: 15 }}>
            Live Golden Boot leaderboard from API-Football. Settles the "top-scorer-5+" prediction market automatically
            when the tournament ends.
          </p>
        </section>
        <TopScorersTable />
      </main>
    </div>
  );
}
