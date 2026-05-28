import { Header } from "@/components/Header";
import { OutrightsHub } from "@/components/OutrightsHub";

export default function OutrightsPage() {
  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0 16px" }}>
          <div className="section-eyebrow">Outright Markets · Tournament Long-Term</div>
          <h1 style={{ fontSize: 36, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.03em" }}>
            Outrights
          </h1>
          <p style={{ color: "var(--text-2)", maxWidth: 700, margin: 0, fontSize: 15 }}>
            Tournament Winner · To Reach Final · Top Goalscorer · Per-Group Winners — long-term parimutuel markets
            with on-chain settlement. The "team token" you actually buy.
          </p>
        </section>
        <OutrightsHub />
      </main>
    </div>
  );
}
