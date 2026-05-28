"use client";

import { useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";

const STORAGE_KEY = "xcup_welcome_seen_v1";

/**
 * One-time onboarding modal for first-time wallet connects. Walks new users
 * through the three steps required before their agent can place bets:
 *
 *   1. Mint test USDC (button is in the AgentPanel below)
 *   2. Top up agent gas (button is in the AgentPanel below)
 *   3. Write a strategy and deploy it
 *
 * Dismissed via localStorage flag, so it appears at most once per browser
 * regardless of which wallet connects. Skipped entirely if the user has
 * already dismissed it before — no nagging.
 */
export function WelcomeModal() {
  const { state } = useWallet();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.kind !== "connected") return;
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(STORAGE_KEY);
    if (!seen) setOpen(true);
  }, [state.kind]);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore storage failures (private mode etc.) — user just sees it again next visit
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 28,
          maxWidth: 480,
          width: "100%",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>
          Welcome to X-Cup OS 🏆
        </div>
        <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.55, margin: "0 0 18px" }}>
          You're connected on <strong>X Layer testnet</strong>. Three quick steps before your
          agent can place bets — each is one button click.
        </p>

        <ol style={{ paddingLeft: 0, listStyle: "none", margin: "0 0 20px" }}>
          <Step
            n={1}
            title="Mint 10,000 test USDC"
            body="Click + Mint 10k USDC in the panel below. Funds your main wallet so you can stake."
          />
          <Step
            n={2}
            title="Top up agent gas"
            body="Click ⛽ Top up agent gas. Sends 0.005 OKB from your wallet to your agent's burner — covers ~500 transactions."
          />
          <Step
            n={3}
            title="Write a strategy"
            body="Type a bet in plain English (e.g. &quot;If Argentina wins, stake 50 USDC YES&quot;). The AI parses it, deploys the agent, and fires bets automatically when conditions hit."
          />
        </ol>

        <div
          style={{
            background: "rgba(255, 196, 0, 0.06)",
            border: "1px solid rgba(255, 196, 0, 0.2)",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 12,
            color: "#ffd66e",
            marginBottom: 18,
            lineHeight: 1.5,
          }}
        >
          <strong>Testnet only.</strong> All assets are mock USDC + testnet OKB. Never send
          mainnet funds to your agent wallet — burner keys are stored server-side and not
          mainnet-safe yet.
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={dismiss} style={{ fontWeight: 600 }}>
            Got it, let me start
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li
      style={{
        display: "flex",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--accent-dim)",
          color: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {n}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{title}</div>
        <div style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.5 }}>{body}</div>
      </div>
    </li>
  );
}
