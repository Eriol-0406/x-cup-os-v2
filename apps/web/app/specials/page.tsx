import { Header } from "@/components/Header";
import { SpecialsGrid } from "@/components/SpecialsGrid";

export default function SpecialsPage() {
  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0 16px" }}>
          <div className="section-eyebrow">Specials · Per-Fixture Player Props</div>
          <h1 style={{ fontSize: 36, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.03em" }}>
            First Scorer Markets
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
