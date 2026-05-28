"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "./WalletProvider";
import { shortAddress } from "@/lib/wallet";
import { getOrCreateAgent } from "@/lib/api";
import { mockUsdc, readProvider, signerProvider } from "@/lib/contract";

const WALLET_TIMEOUT_MS = 90_000;

type AgentState =
  | { kind: "noWallet" }
  | { kind: "provisioning" }
  | { kind: "ready"; address: string; okb: bigint; usdc: bigint; userUsdc: bigint }
  | { kind: "error"; message: string };

type FundState =
  | { kind: "idle" }
  | { kind: "approving" }
  | { kind: "sending"; txHash?: string }
  | { kind: "done"; txHash: string }
  | { kind: "error"; message: string };

const DEFAULT_FUND_AMOUNT = "100";

export function AgentPanel() {
  const { state: walletState } = useWallet();
  const [agent, setAgent] = useState<AgentState>({ kind: "noWallet" });
  const [fundAmount, setFundAmount] = useState(DEFAULT_FUND_AMOUNT);
  const [fund, setFund] = useState<FundState>({ kind: "idle" });

  const userAddress = walletState.kind === "connected" ? walletState.address : null;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };
  useEffect(() => () => clearTimer(), []);

  const cancelFund = () => {
    clearTimer();
    setFund({ kind: "idle" });
  };

  const armWalletTimeout = () => {
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setFund({
        kind: "error",
        message: "Timed out — wallet popup closed or no response. Try again.",
      });
    }, WALLET_TIMEOUT_MS);
  };

  // Load (or create) the agent + balances once the user is connected.
  const refresh = useCallback(async () => {
    if (!userAddress) {
      setAgent({ kind: "noWallet" });
      return;
    }
    setAgent({ kind: "provisioning" });
    try {
      const info = await getOrCreateAgent(userAddress);
      const provider = readProvider();
      const usdc = mockUsdc(provider);
      const [okb, agentUsdc, userUsdcBal] = await Promise.all([
        provider.getBalance(info.agentAddress),
        usdc.balanceOf(info.agentAddress) as Promise<bigint>,
        usdc.balanceOf(userAddress) as Promise<bigint>,
      ]);
      setAgent({ kind: "ready", address: info.agentAddress, okb, usdc: agentUsdc, userUsdc: userUsdcBal });
    } catch (err: any) {
      setAgent({ kind: "error", message: err?.message ?? "Failed to load agent" });
    }
  }, [userAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onFund = async () => {
    if (agent.kind !== "ready") return;
    const amount = Number(fundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFund({ kind: "error", message: "Enter a positive amount" });
      return;
    }
    setFund({ kind: "approving" });
    armWalletTimeout();
    try {
      const signer = await signerProvider();
      const usdc = mockUsdc(signer);
      const amountUnits = ethers.parseUnits(String(amount), 6);
      setFund({ kind: "sending" });
      const tx = await usdc.transfer(agent.address, amountUnits);
      setFund({ kind: "sending", txHash: tx.hash });
      await tx.wait();
      clearTimer();
      setFund({ kind: "done", txHash: tx.hash });
      await refresh();
    } catch (err: any) {
      clearTimer();
      const code = err?.code;
      const userRejected = code === 4001 || /rejected|denied|user closed|user cancel/i.test(err?.message ?? "");
      setFund({
        kind: "error",
        message: userRejected ? "Transaction rejected" : err?.message ?? "Fund failed",
      });
    }
  };

  const onMint = async () => {
    if (!userAddress) return;
    setFund({ kind: "approving" });
    armWalletTimeout();
    try {
      const signer = await signerProvider();
      const usdc = mockUsdc(signer);
      const amount = ethers.parseUnits("10000", 6);
      setFund({ kind: "sending" });
      const tx = await usdc.mint(userAddress, amount);
      setFund({ kind: "sending", txHash: tx.hash });
      await tx.wait();
      clearTimer();
      setFund({ kind: "done", txHash: tx.hash });
      await refresh();
    } catch (err: any) {
      clearTimer();
      const code = err?.code;
      const userRejected = code === 4001 || /rejected|denied|user closed|user cancel/i.test(err?.message ?? "");
      setFund({
        kind: "error",
        message: userRejected ? "Transaction rejected" : err?.message ?? "Mint failed",
      });
    }
  };

  /**
   * Sends a small amount of testnet OKB from the user's main wallet → their
   * burner. The burner needs gas to call stake()/claim() on-chain when the
   * agent fires. 0.005 OKB covers ~500 transactions at current X Layer
   * testnet gas prices — plenty for a demo session.
   */
  const onTopUpOkb = async () => {
    if (agent.kind !== "ready") return;
    setFund({ kind: "approving" });
    armWalletTimeout();
    try {
      const signer = await signerProvider();
      setFund({ kind: "sending" });
      const tx = await signer.sendTransaction({
        to: agent.address,
        value: ethers.parseEther("0.005"),
      });
      setFund({ kind: "sending", txHash: tx.hash });
      await tx.wait();
      clearTimer();
      setFund({ kind: "done", txHash: tx.hash });
      await refresh();
    } catch (err: any) {
      clearTimer();
      const code = err?.code;
      const userRejected = code === 4001 || /rejected|denied|user closed|user cancel/i.test(err?.message ?? "");
      setFund({
        kind: "error",
        message: userRejected ? "Transaction rejected" : err?.message ?? "Top-up failed",
      });
    }
  };

  if (agent.kind === "noWallet") {
    return null; // Render nothing until wallet is connected — the editor is the focus.
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <div className="agent-panel">
        <div className="agent-header">
          <div>
            <div className="panel-title" style={{ marginBottom: 4 }}>Your Agent</div>
            <div className="agent-address" title={agent.kind === "ready" ? agent.address : ""}>
              {agent.kind === "ready" ? shortAddress(agent.address) : "—"}
            </div>
          </div>
          {agent.kind === "ready" && (
            <div className="agent-balances">
              <div className="agent-bal">
                <div className="agent-bal-num">{Number(ethers.formatUnits(agent.usdc, 6)).toFixed(2)}</div>
                <div className="agent-bal-label">USDC bankroll</div>
              </div>
              <div className="agent-bal-divider" />
              <div className="agent-bal">
                <div className="agent-bal-num">{Number(ethers.formatEther(agent.okb)).toFixed(4)}</div>
                <div className="agent-bal-label">OKB gas</div>
              </div>
            </div>
          )}
        </div>

        {agent.kind === "provisioning" && (
          <div className="loading-card" style={{ marginTop: 14 }}>
            <span className="spinner" /> Generating your agent burner wallet…
          </div>
        )}

        {agent.kind === "error" && (
          <div className="error-card" style={{ marginTop: 14 }}>
            <strong>Couldn't load agent</strong> — {agent.message}
          </div>
        )}

        {agent.kind === "ready" && (
          <>
            <div className="agent-fund-row">
              <div className="agent-fund-info">
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                  Your USDC balance: <strong style={{ color: "var(--text-2)" }}>
                    {Number(ethers.formatUnits(agent.userUsdc, 6)).toFixed(2)}
                  </strong>
                </span>
              </div>
              <input
                type="number"
                min="1"
                step="1"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                className="strategy-input"
                style={{ minHeight: 36, padding: "8px 12px", maxWidth: 120, fontSize: 13 }}
                disabled={agent.userUsdc === 0n}
              />
              <span style={{ color: "var(--text-3)", fontSize: 13 }}>USDC →</span>
              <button
                className="btn btn-primary"
                onClick={onFund}
                disabled={agent.userUsdc === 0n || fund.kind === "approving" || fund.kind === "sending"}
                title={agent.userUsdc === 0n ? "Mint USDC first" : "Send USDC to your agent's burner wallet"}
              >
                {fund.kind === "approving"
                  ? "Confirm in wallet…"
                  : fund.kind === "sending"
                    ? "Confirming on-chain…"
                    : "Fund agent"}
              </button>
            </div>

            {/* Secondary action row — mint USDC + top up OKB gas. Always
                available so users don't get stuck if their burner runs dry. */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                className="btn"
                onClick={onMint}
                disabled={fund.kind === "approving" || fund.kind === "sending"}
                title="Mint 10,000 test USDC to your main wallet (open mint — anyone can call it)"
                style={{ fontSize: 12 }}
              >
                + Mint 10k USDC
              </button>
              <button
                className="btn"
                onClick={onTopUpOkb}
                disabled={fund.kind === "approving" || fund.kind === "sending"}
                title="Send 0.005 OKB from your main wallet to your burner — covers ~500 agent transactions"
                style={{ fontSize: 12 }}
              >
                ⛽ Top up agent gas (0.005 OKB)
              </button>
              <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>
                Need testnet OKB?{" "}
                <a
                  href="https://web3.okx.com/xlayer/faucet/xlayerfaucet"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  X Layer faucet ↗
                </a>
              </span>
            </div>
          </>
        )}

        {(fund.kind === "approving" || fund.kind === "sending") && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="spinner" />
            {fund.kind === "approving" ? "Waiting for wallet confirmation…" : "Confirming on-chain…"}
            <button className="tourney-cancel" onClick={cancelFund} title="Reset if your wallet popup closed">
              cancel
            </button>
          </div>
        )}
        {fund.kind === "done" && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--success)" }}>
            ✓ Transfer confirmed —{" "}
            <a href={`https://www.oklink.com/x-layer-testnet/tx/${fund.txHash}`} target="_blank" rel="noreferrer">
              view tx
            </a>
          </div>
        )}
        {fund.kind === "error" && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--error)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1 }}>✗ {fund.message}</span>
            <button className="tourney-cancel" onClick={cancelFund}>dismiss</button>
          </div>
        )}
      </div>
    </section>
  );
}
