import { Header } from "@/components/Header";
import { TournamentMarketGrid } from "@/components/TournamentMarketGrid";

export default function OutrightsPage() {
  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0 16px" }}>
          <div className="kicker">
            <span className="kicker-dot" />
            Long-term outcome shares
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 8px", letterSpacing: "-0.03em" }}>
            Outrights — Tournament Winners
          </h1>
          <p style={{ color: "var(--text-2)", maxWidth: 700, margin: 0, fontSize: 15 }}>
            32 binary markets, one per team. Bet YES that this nation lifts the cup, or NO that they don't. Settled at
            tournament end. The "team token" you actually buy.
          </p>
        </section>
        <TournamentMarketGrid />
      </main>
    </div>
  );
}
