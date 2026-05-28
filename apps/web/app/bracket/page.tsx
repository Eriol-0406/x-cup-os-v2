import { Header } from "@/components/Header";
import { KnockoutBracket } from "@/components/KnockoutBracket";

export default function BracketPage() {
  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0 16px" }}>
          <div className="section-eyebrow">Knockout Phase · R32 → Final</div>
          <h1 style={{ fontSize: 36, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.03em" }}>
            Tournament Bracket
          </h1>
          <p style={{ color: "var(--text-2)", maxWidth: 700, margin: 0, fontSize: 15 }}>
            FIFA's official WC 2026 bracket structure with seed labels (1A, 2B, 3CDEF). Slots
            fill in as the group stage concludes. Each match becomes a bettable on-chain market
            on the <a href="/match">Match page</a> once teams qualify.
          </p>
        </section>
        <KnockoutBracket />
      </main>
    </div>
  );
}
