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
                src="/trophy-hero(1).mp4"
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
        <div className="container footer-inner">
          <div className="footer-tagline">
            X-Cup OS · powered by Llama 3.3 on Groq + X Layer
          </div>
          <div className="footer-links">
            <a
              href="https://x.com/XCupOS_OKX"
              target="_blank"
              rel="noreferrer"
              title="X-Cup OS on X"
              aria-label="X-Cup OS on X (Twitter)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2H21.5l-7.6 8.69L23 22h-7.05l-5.52-7.21L4.1 22H.84l8.13-9.3L.5 2h7.22l4.98 6.57L18.244 2zm-1.236 18h1.95L7.06 4H5l11.99 16z" />
              </svg>
              <span>@XCupOS_OKX</span>
            </a>
            <span className="footer-sep">·</span>
            <span className="footer-credit">
              built by
              <a
                href="https://x.com/lheWp20"
                target="_blank"
                rel="noreferrer"
                title="Owner on X"
                style={{ marginLeft: 6 }}
              >
                @lheWp20
              </a>
              <a
                href="https://github.com/Eriol-0406"
                target="_blank"
                rel="noreferrer"
                title="Owner on GitHub"
                aria-label="Owner on GitHub"
                style={{ marginLeft: 8, display: "inline-flex", alignItems: "center" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.08-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.77.11 3.06.74.8 1.19 1.82 1.19 3.08 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
                </svg>
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
