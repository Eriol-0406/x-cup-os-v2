import { Header } from "@/components/Header";
import { StrategyEditor } from "@/components/StrategyEditor";
import { MatchList } from "@/components/MatchList";
import { ActivityDashboard } from "@/components/ActivityDashboard";
import { AgentPanel } from "@/components/AgentPanel";
import { TournamentMarketGrid } from "@/components/TournamentMarketGrid";

export default function HomePage() {
  return (
    <div className="shell">
      <Header />

      <main className="container" style={{ flex: 1 }}>
        <section className="hero">
          <div className="kicker">
            <span className="kicker-dot" />
            Live on X Layer testnet · World Cup 2026
          </div>
          <h1>Bet on football. Without ever clicking "place bet".</h1>
          <p>
            Write a strategy in plain English. Deploy an AI agent. It watches every match, reads live data, and places
            bets on-chain when your conditions hit. You sleep, your agent trades.
          </p>
        </section>

        <AgentPanel />
        <StrategyEditor />
        <TournamentMarketGrid />
        <MatchList />
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
