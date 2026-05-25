import { Header } from "@/components/Header";
import { SpecialsGrid } from "@/components/SpecialsGrid";

export default function SpecialsPage() {
  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0 16px" }}>
          <div className="kicker">
            <span className="kicker-dot" />
            Per-fixture player props
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 8px", letterSpacing: "-0.03em" }}>
            Specials — First Scorer
          </h1>
          <p style={{ color: "var(--text-2)", maxWidth: 700, margin: 0, fontSize: 15 }}>
            Player-level prop markets per fixture. Each knockout match has a market with real player outcomes (Messi,
            Mbappé, Giroud…) pulled from API-Football goal events.
          </p>
        </section>
        <SpecialsGrid />
      </main>
    </div>
  );
}
