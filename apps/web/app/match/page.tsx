import { Header } from "@/components/Header";
import { MatchList } from "@/components/MatchList";

export default function MatchPage() {
  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0 16px" }}>
          <div className="section-eyebrow">Per-Match Markets · 1x2 Home / Draw / Away</div>
          <h1 style={{ fontSize: 36, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.03em" }}>
            Match Prediction Markets
          </h1>
          <p style={{ color: "var(--text-2)", maxWidth: 700, margin: 0, fontSize: 15 }}>
            One on-chain parimutuel market per fixture. 64 WC 2022 matches synced from API-Football. Click "Replay this
            match" on a finished card to see the full agent loop in action.
          </p>
        </section>
        <MatchList />
      </main>
    </div>
  );
}
