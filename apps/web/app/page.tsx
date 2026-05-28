import Link from "next/link";
import { Header } from "@/components/Header";
import { StrategyEditor } from "@/components/StrategyEditor";
import { ActivityDashboard } from "@/components/ActivityDashboard";
import { AgentPanel } from "@/components/AgentPanel";
import { WelcomeModal } from "@/components/WelcomeModal";

export default function HomePage() {
  return (
    <div className="shell">
      <Header />
      <WelcomeModal />

      <main className="container" style={{ flex: 1 }}>
        <section className="hero">
          <div className="hero-grid">
            <div className="hero-text">
              <div className="kicker">
                <span className="kicker-dot" />
                Live on X Layer testnet · powered by Llama 3.3 + Groq
              </div>
              <h1>
                Bet on football.
                <br />
                Without ever clicking <span style={{ fontStyle: "italic" }}>"place bet"</span>.
              </h1>
              <p>
                Write a strategy in plain English. Deploy an AI agent. It watches every match, reads live data, and places
                bets on-chain when your conditions hit. You sleep, your agent trades.
              </p>
            </div>
            <div className="hero-trophy-wrap" aria-hidden="true">
              <video
                src="/trophy-hero.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
              />
            </div>
          </div>
          <div className="hero-nav-row" style={{ marginTop: 40 }}>
            <Link href="/match" className="hero-nav-card">
              <span className="hero-nav-emoji">⚽</span>
              <span className="hero-nav-title">Match</span>
              <span className="hero-nav-sub">1x2 per-fixture · 64 markets</span>
            </Link>
            <Link href="/outrights" className="hero-nav-card">
              <span className="hero-nav-emoji">🏆</span>
              <span className="hero-nav-title">Outrights</span>
              <span className="hero-nav-sub">Team-token · 32 markets</span>
            </Link>
            <Link href="/predictions" className="hero-nav-card">
              <span className="hero-nav-emoji">🔮</span>
              <span className="hero-nav-title">Predictions</span>
              <span className="hero-nav-sub">Yes/No opinion · 5 markets</span>
            </Link>
            <Link href="/specials" className="hero-nav-card">
              <span className="hero-nav-emoji">🎯</span>
              <span className="hero-nav-title">Specials</span>
              <span className="hero-nav-sub">First scorer · 16 markets</span>
            </Link>
            <Link href="/bracket" className="hero-nav-card">
              <span className="hero-nav-emoji">🏟️</span>
              <span className="hero-nav-title">Bracket</span>
              <span className="hero-nav-sub">Knockout tree</span>
            </Link>
            <Link href="/leaderboard" className="hero-nav-card">
              <span className="hero-nav-emoji">📊</span>
              <span className="hero-nav-title">Leaderboard</span>
              <span className="hero-nav-sub">Top strategies + copy</span>
            </Link>
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
