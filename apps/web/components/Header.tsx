"use client";

import { useState } from "react";

export function Header() {
  const [connected, setConnected] = useState(false);

  // Wallet connect is stubbed for the UI preview — real OKX Wallet wiring lands
  // in Task #5 follow-up. For now this just toggles state so the demo looks live.
  const onConnect = () => setConnected((v) => !v);

  return (
    <header className="header">
      <div className="container header-inner">
        <div className="logo">
          <span className="logo-dot" />
          <span>X-Cup OS</span>
          <span className="logo-sub">/ World Cup betting agents</span>
        </div>
        <nav className="nav">
          <a className="nav-link" href="#editor">
            Deploy
          </a>
          <a className="nav-link" href="#matches">
            Matches
          </a>
          <a className="nav-link" href="#leaderboard">
            Leaderboard
          </a>
          <button className={connected ? "btn" : "btn btn-primary"} onClick={onConnect}>
            {connected ? "0xA11C…E0f3" : "Connect Wallet"}
          </button>
        </nav>
      </div>
    </header>
  );
}
