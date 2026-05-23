"use client";

import { useWallet } from "./WalletProvider";

/**
 * Agent activity table. Reads from /strategies/:id/fires on the backend.
 *
 * Day 4: empty-state only — strategy firing (#8 + #9) lands next, and once
 * a fire is recorded we'll render rows here with explorer links to each
 * stake() tx hash.
 */
export function ActivityDashboard() {
  const { state } = useWallet();

  return (
    <section id="activity" style={{ marginBottom: 64 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Agent Activity</h2>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
            Every time your agent fires a strategy, the on-chain stake shows up here.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="preview-empty">
          {state.kind === "connected" ? (
            <>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📡</div>
              <div>No agent activity yet.</div>
              <div style={{ fontSize: 12, marginTop: 6, color: "var(--text-3)" }}>
                Deploy a strategy above — when a trigger condition hits, the agent fires automatically and the tx
                appears here.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, marginBottom: 8 }}>👛</div>
              <div>Connect your wallet to see agent activity.</div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
