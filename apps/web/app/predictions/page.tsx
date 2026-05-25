import { Header } from "@/components/Header";
import { PredictionMarketGrid } from "@/components/PredictionMarketGrid";

export default function PredictionsPage() {
  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0 16px" }}>
          <div className="kicker">
            <span className="kicker-dot" />
            Yes / No opinion markets
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 8px", letterSpacing: "-0.03em" }}>
            Predictions
          </h1>
          <p style={{ color: "var(--text-2)", maxWidth: 700, margin: 0, fontSize: 15 }}>
            Bet on tournament-wide opinions, not match outcomes. "Will an unbeaten champion emerge?", "Will the Golden
            Boot winner be European?" — Polymarket-style binary markets, on-chain via XCupMarket.
          </p>
        </section>
        <PredictionMarketGrid />
      </main>
    </div>
  );
}
