import { Header } from "@/components/Header";
import { StrategyEditor } from "@/components/StrategyEditor";
import { ActivityDashboard } from "@/components/ActivityDashboard";
import { AgentPanel } from "@/components/AgentPanel";

export default function HomePage() {
  return (
    <div className="shell">
      <Header />

      <main className="container" style={{ flex: 1 }}>
        <section className="hero">
          <div className="kicker">
            <span className="kicker-dot" />
            Live on X Layer testnet · World Cup 2022 (historical replay)
          </div>
          <h1>Bet on football. Without ever clicking "place bet".</h1>
          <p>
            Write a strategy in plain English. Deploy an AI agent. It watches every match, reads live data, and places
            bets on-chain when your conditions hit. You sleep, your agent trades.
          </p>
          <div className="hero-nav-row">
            <a href="/match" className="hero-nav-card">
              <span className="hero-nav-emoji">⚽</span>
              <span className="hero-nav-title">Match</span>
              <span className="hero-nav-sub">1x2 per-fixture · 64 markets</span>
            </a>
            <a href="/outrights" className="hero-nav-card">
              <span className="hero-nav-emoji">🏆</span>
              <span className="hero-nav-title">Outrights</span>
              <span className="hero-nav-sub">Team-token · 32 markets</span>
            </a>
            <a href="/predictions" className="hero-nav-card">
              <span className="hero-nav-emoji">🔮</span>
              <span className="hero-nav-title">Predictions</span>
              <span className="hero-nav-sub">Yes/No opinion · 5 markets</span>
            </a>
            <a href="/specials" className="hero-nav-card">
              <span className="hero-nav-emoji">🎯</span>
              <span className="hero-nav-title">Specials</span>
              <span className="hero-nav-sub">First scorer · 16 markets</span>
            </a>
            <a href="/bracket" className="hero-nav-card">
              <span className="hero-nav-emoji">🏟️</span>
              <span className="hero-nav-title">Bracket</span>
              <span className="hero-nav-sub">Knockout tree</span>
            </a>
            <a href="/leaderboard" className="hero-nav-card">
              <span className="hero-nav-emoji">📊</span>
              <span className="hero-nav-title">Leaderboard</span>
              <span className="hero-nav-sub">Top strategies + copy</span>
            </a>
          </div>
        </section>

        <AgentPanel />
        <StrategyEditor />
        <ActivityDashboard />
      </main>

      <footer className="footer">
        <div className="container">
          X-Cup OS · powered by Llama 3.3 on Groq + X Layer · Day {Math.min(14, Math.max(1, daysFromMay22()))} of build
        </div>
      </footer>
    </div>
  );
}

function daysFromMay22(): number {
  const start = new Date("2026-05-22T00:00:00Z").getTime();
  const now = Date.now();
  return Math.floor((now - start) / 86400000) + 1;
}
