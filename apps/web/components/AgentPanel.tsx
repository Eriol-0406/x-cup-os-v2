"use client";

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "./WalletProvider";
import { shortAddress } from "@/lib/wallet";
import { getOrCreateAgent } from "@/lib/api";
import { mockUsdc, readProvider, signerProvider } from "@/lib/contract";

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
    try {
      const signer = await signerProvider();
      const usdc = mockUsdc(signer);
      const amountUnits = ethers.parseUnits(String(amount), 6);
      setFund({ kind: "sending" });
      const tx = await usdc.transfer(agent.address, amountUnits);
      setFund({ kind: "sending", txHash: tx.hash });
      await tx.wait();
      setFund({ kind: "done", txHash: tx.hash });
      await refresh();
    } catch (err: any) {
      const code = err?.code;
      const userRejected = code === 4001 || /rejected|denied/i.test(err?.message ?? "");
      setFund({
        kind: "error",
        message: userRejected ? "Transaction rejected" : err?.message ?? "Fund failed",
      });
    }
  };

  const onMint = async () => {
    if (!userAddress) return;
    setFund({ kind: "approving" });
    try {
      const signer = await signerProvider();
      const usdc = mockUsdc(signer);
      const amount = ethers.parseUnits("10000", 6);
      setFund({ kind: "sending" });
      const tx = await usdc.mint(userAddress, amount);
      setFund({ kind: "sending", txHash: tx.hash });
      await tx.wait();
      setFund({ kind: "done", txHash: tx.hash });
      await refresh();
    } catch (err: any) {
      setFund({ kind: "error", message: err?.message ?? "Mint failed" });
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
          <div className="agent-fund-row">
            <div className="agent-fund-info">
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                Your USDC balance: <strong style={{ color: "var(--text-2)" }}>
                  {Number(ethers.formatUnits(agent.userUsdc, 6)).toFixed(2)}
                </strong>
              </span>
            </div>
            {agent.userUsdc === 0n ? (
              <button className="btn btn-primary" onClick={onMint} disabled={fund.kind === "approving" || fund.kind === "sending"}>
                {fund.kind === "approving" || fund.kind === "sending" ? "Minting…" : "Mint 10,000 test USDC"}
              </button>
            ) : (
              <>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="strategy-input"
                  style={{ minHeight: 36, padding: "8px 12px", maxWidth: 120, fontSize: 13 }}
                />
                <span style={{ color: "var(--text-3)", fontSize: 13 }}>USDC →</span>
                <button
                  className="btn btn-primary"
                  onClick={onFund}
                  disabled={fund.kind === "approving" || fund.kind === "sending"}
                >
                  {fund.kind === "approving"
                    ? "Confirm in wallet…"
                    : fund.kind === "sending"
                      ? "Confirming on-chain…"
                      : "Fund agent"}
                </button>
              </>
            )}
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
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--error)" }}>✗ {fund.message}</div>
        )}
      </div>
    </section>
  );
}
