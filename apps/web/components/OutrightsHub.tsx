"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  listTournamentMarkets,
  listTournamentMarketsByType,
  listTournamentSpecials,
  type TournamentMarketRecord,
  type TournamentSpecialView,
} from "@/lib/api";
import { mockUsdc, signerProvider, xcupMarket } from "@/lib/contract";
import { useWallet } from "./WalletProvider";
import { TournamentMarketGrid } from "./TournamentMarketGrid";

const EXPLORER = "https://www.oklink.com/x-layer-testnet";
const WALLET_TIMEOUT_MS = 90_000;

type Tab = "winner" | "to_reach_final" | "top_scorer" | "group_winner";

export function OutrightsHub() {
  const [tab, setTab] = useState<Tab>("winner");

  return (
    <div>
      <div className="outrights-tabs">
        <TabBtn label="Winner" id="winner" current={tab} onClick={setTab} />
        <TabBtn label="To Reach Final" id="to_reach_final" current={tab} onClick={setTab} />
        <TabBtn label="Top Goalscorer" id="top_scorer" current={tab} onClick={setTab} />
        <TabBtn label="Per-Group Winner" id="group_winner" current={tab} onClick={setTab} />
      </div>

      <div style={{ marginTop: 20 }}>
        {tab === "winner" && <TournamentMarketGrid />}
        {tab === "to_reach_final" && <ToReachFinalGrid />}
        {tab === "top_scorer" && <SpecialsList type="top_scorer" />}
        {tab === "group_winner" && <SpecialsList type="group_winner" />}
      </div>
    </div>
  );
}

function TabBtn({ id, label, current, onClick }: { id: Tab; label: string; current: Tab; onClick: (t: Tab) => void }) {
  return (
    <button
      className={`outright-tab${current === id ? " outright-tab-active" : ""}`}
      onClick={() => onClick(id)}
    >
      {label}
    </button>
  );
}

/** Reuses TournamentMarketGrid's UI but pre-filters to type=to_reach_final.
 *  Since TournamentMarketGrid hardcodes the "winner" endpoint, we render our
 *  own simpler card grid for this. */
function ToReachFinalGrid() {
  const [markets, setMarkets] = useState<TournamentMarketRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const ms = await listTournamentMarketsByType("to_reach_final");
        setMarkets(ms);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="loading-card"><span className="spinner" /> Loading…</div>;
  if (markets.length === 0) return <div className="preview-empty">Run <code>POST /admin/create-to-reach-final-markets</code> to seed.</div>;

  return (
    <div>
      <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 12 }}>
        Binary YES/NO per team — does this nation reach the Final? Settled at tournament end.
      </div>
      <div className="tourney-grid">
        {markets.map((m) => (
          <ToReachFinalCard key={m.teamId} m={m} />
        ))}
      </div>
    </div>
  );
}

type StakeState = { kind: "idle" } | { kind: "running"; outcome: 0 | 1 } | { kind: "done"; tx: string } | { kind: "error"; message: string };

function ToReachFinalCard({ m }: { m: TournamentMarketRecord }) {
  const { state: walletState, connect } = useWallet();
  const [amount, setAmount] = useState("10");
  const [stake, setStake] = useState<StakeState>({ kind: "idle" });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clearTimer = () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); timeoutRef.current = null; };
  useEffect(() => () => clearTimer(), []);

  const onBet = async (outcome: 0 | 1) => {
    if (walletState.kind !== "connected") return void connect();
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) {
      setStake({ kind: "error", message: "Enter a positive amount" });
      return;
    }
    setStake({ kind: "running", outcome });
    clearTimer();
    timeoutRef.current = setTimeout(() => setStake({ kind: "error", message: "Wallet timeout" }), WALLET_TIMEOUT_MS);
    try {
      const signer = await signerProvider();
      const usdc = mockUsdc(signer) as any;
      const xcup = xcupMarket(signer) as any;
      const stakeAmount = ethers.parseUnits(String(v), 6);
      const allowance: bigint = await usdc.allowance(walletState.address, await xcup.getAddress());
      if (allowance < stakeAmount) {
        const t = await usdc.approve(await xcup.getAddress(), ethers.MaxUint256);
        await t.wait();
      }
      const tx = await xcup.stake(m.marketId, outcome, stakeAmount);
      await tx.wait();
      clearTimer();
      setStake({ kind: "done", tx: tx.hash });
    } catch (err: any) {
      clearTimer();
      const userRejected = err?.code === 4001 || /rejected|denied|user closed|user cancel/i.test(err?.message ?? "");
      setStake({ kind: "error", message: userRejected ? "Rejected" : err?.shortMessage ?? err?.message ?? "Bet failed" });
    }
  };

  return (
    <div className={`tourney-card${m.settled ? " tourney-card-settled" : ""}`}>
      <div className="tourney-card-header">
        <Image src={m.teamLogo} alt={m.teamName} width={28} height={28} unoptimized className="tourney-flag" />
        <div className="tourney-team-block">
          <div className="tourney-team-name">{m.teamName}</div>
          <div className="tourney-team-code">{m.teamCode ?? ""}</div>
        </div>
      </div>
      <div className="tourney-prob-row">
        <span style={{ color: m.impliedYesProb > 0 ? "var(--success)" : "var(--text-3)" }}>YES {(m.impliedYesProb * 100).toFixed(0)}%</span>
        <span style={{ color: "var(--text-3)" }}>{m.totalPotUsdc} USDC pool</span>
      </div>
      <div className="tourney-bet-row">
        <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="tourney-input" />
        <button className="tourney-bet-btn tourney-bet-yes" onClick={() => onBet(0)} disabled={stake.kind === "running"}>YES</button>
        <button className="tourney-bet-btn tourney-bet-no" onClick={() => onBet(1)} disabled={stake.kind === "running"}>NO</button>
      </div>
      {stake.kind === "running" && (
        <div className="tourney-status">
          <span className="spinner" /> Confirming…
          <button className="tourney-cancel" onClick={() => { clearTimer(); setStake({ kind: "idle" }); }}>cancel</button>
        </div>
      )}
      {stake.kind === "done" && (
        <div className="tourney-status" style={{ color: "var(--success)" }}>
          ✓ <a href={`${EXPLORER}/tx/${stake.tx}`} target="_blank" rel="noreferrer">tx</a>
        </div>
      )}
      {stake.kind === "error" && (
        <div className="tourney-status" style={{ color: "var(--error)" }}>
          ✗ {stake.message}
          <button className="tourney-cancel" onClick={() => setStake({ kind: "idle" })}>dismiss</button>
        </div>
      )}
    </div>
  );
}

function SpecialsList({ type }: { type: string }) {
  const [markets, setMarkets] = useState<TournamentSpecialView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const ms = await listTournamentSpecials({ type });
        setMarkets(ms);
      } finally {
        setLoading(false);
      }
    })();
  }, [type]);

  if (loading) return <div className="loading-card"><span className="spinner" /> Loading…</div>;
  if (markets.length === 0) return <div className="preview-empty">No {type.replace(/_/g, " ")} markets yet.</div>;

  return (
    <div className="specials-list">
      {markets.map((m) => (
        <SpecialCard key={m.id} m={m} />
      ))}
    </div>
  );
}

function SpecialCard({ m }: { m: TournamentSpecialView }) {
  const { state: walletState, connect } = useWallet();
  const [amount, setAmount] = useState("10");
  const [staking, setStaking] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const onBet = async (outcomeIdx: number) => {
    if (walletState.kind !== "connected") return void connect();
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) {
      setMessage({ kind: "err", text: "Enter a positive amount" });
      return;
    }
    setStaking(outcomeIdx);
    setMessage(null);
    try {
      const signer = await signerProvider();
      const usdc = mockUsdc(signer) as any;
      const xcup = xcupMarket(signer) as any;
      const stakeAmount = ethers.parseUnits(String(v), 6);
      const allowance: bigint = await usdc.allowance(walletState.address, await xcup.getAddress());
      if (allowance < stakeAmount) {
        const t = await usdc.approve(await xcup.getAddress(), ethers.MaxUint256);
        await t.wait();
      }
      const tx = await xcup.stake(m.marketId, outcomeIdx, stakeAmount);
      await tx.wait();
      setMessage({ kind: "ok", text: `✓ Staked on "${m.outcomes[outcomeIdx]?.label}"` });
    } catch (err: any) {
      const userRejected = err?.code === 4001 || /rejected|denied/i.test(err?.message ?? "");
      setMessage({ kind: "err", text: userRejected ? "Rejected" : err?.shortMessage ?? err?.message ?? "Bet failed" });
    } finally {
      setStaking(null);
    }
  };

  return (
    <div className="special-card">
      <div className="special-card-header">
        <strong>{m.question}</strong>
        <span className="special-card-meta">M#{m.marketId} · {m.totalPotUsdc} USDC pool</span>
      </div>
      {m.settled && (
        <div className="status-pill status-settled" style={{ display: "inline-block", marginBottom: 8 }}>
          Settled — winner: {m.outcomes.find((o) => o.idx === m.winningOutcome)?.label ?? "?"}
        </div>
      )}
      <div className="special-card-stake-row">
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="tourney-input"
          style={{ maxWidth: 70 }}
        />
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>USDC per outcome →</span>
      </div>
      <div className="special-outcomes">
        {m.outcomes.map((o) => (
          <button
            key={o.idx}
            className={`special-outcome-btn${o.isWinner ? " special-outcome-winner" : ""}`}
            onClick={() => onBet(o.idx)}
            disabled={staking !== null || m.settled}
          >
            {o.teamLogo && <Image src={o.teamLogo} alt={o.label} width={16} height={16} unoptimized />}
            {o.photo && <Image src={o.photo} alt={o.label} width={18} height={18} unoptimized style={{ borderRadius: 999 }} />}
            <span className="special-outcome-label">{o.label}</span>
            <span className="special-outcome-prob">{(o.impliedProb * 100).toFixed(0)}%</span>
            {staking === o.idx && <span className="spinner" style={{ width: 10, height: 10 }} />}
          </button>
        ))}
      </div>
      {message && (
        <div style={{ marginTop: 8, fontSize: 12, color: message.kind === "ok" ? "var(--success)" : "var(--error)" }}>
          {message.text}
        </div>
      )}
    </div>
  );
}
