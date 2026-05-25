"use client";

import Link from "next/link";
import { useWallet } from "./WalletProvider";
import { shortAddress } from "@/lib/wallet";

export function Header() {
  const { state, connect, disconnect, switchChain } = useWallet();

  const renderWalletButton = () => {
    switch (state.kind) {
      case "disconnected":
        return (
          <button className="btn btn-primary" onClick={connect}>
            Connect Wallet
          </button>
        );
      case "connecting":
        return (
          <button className="btn" disabled>
            <span className="spinner" style={{ width: 10, height: 10 }} /> Connecting…
          </button>
        );
      case "wrong_chain":
        return (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="tag tag-no" title={`Currently on chain ${state.chainId}`}>
              Wrong network
            </span>
            <button className="btn btn-primary" onClick={switchChain}>
              Switch to X Layer
            </button>
          </div>
        );
      case "connected":
        return (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="tag tag-yes" title="Connected to X Layer testnet (chain 1952)">
              X Layer
            </span>
            <button
              className="btn"
              onClick={disconnect}
              title={state.address}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
            >
              {shortAddress(state.address)}
            </button>
          </div>
        );
      case "error":
        return (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              className="tag tag-no"
              title={state.message}
              style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {state.message.length > 32 ? state.message.slice(0, 32) + "…" : state.message}
            </span>
            <button className="btn btn-primary" onClick={connect}>
              Retry
            </button>
          </div>
        );
    }
  };

  return (
    <header className="header">
      <div className="container header-inner">
        <div className="logo">
          <img src="/logo.png" alt="X-Cup Logo" style={{ width: 48, height: 48, borderRadius: '4px', objectFit: 'contain', margin: '0 8px' }} />
          <span>X-Cup OS</span>
          <span className="logo-sub">/ World Cup betting agents</span>
        </div>
        <nav className="nav">
          <Link className="nav-link" href="/">
            Deploy
          </Link>
          <Link className="nav-link" href="/match">
            Match
          </Link>
          <Link className="nav-link" href="/outrights">
            Outrights
          </Link>
          <Link className="nav-link" href="/predictions">
            Predictions
          </Link>
          <Link className="nav-link" href="/specials">
            Specials
          </Link>
          <Link className="nav-link" href="/bracket">
            Bracket
          </Link>
          <Link className="nav-link" href="/standings">
            Standings
          </Link>
          <Link className="nav-link" href="/top-scorers">
            Scorers
          </Link>
          <Link className="nav-link" href="/leaderboard">
            Leaderboard
          </Link>
          {renderWalletButton()}
        </nav>
      </div>
    </header>
  );
}
